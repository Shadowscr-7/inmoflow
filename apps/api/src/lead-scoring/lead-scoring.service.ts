import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadTemperature } from "@inmoflow/db";

/**
 * Lead Scoring — calculates a 0-100 score for each lead
 * based on activity signals, then assigns a temperature label.
 *
 * Weights are defined in DEFAULT_SCORING_CONFIG and can be overridden
 * per-tenant by storing a JSON object in the `scoringConfig` field
 * of the Tenant model (or via SCORING_CONFIG env var).
 */

export interface ScoringConfig {
  emailPoints: number;
  phonePoints: number;
  messagesCap: number;       // max pts for messages (1pt per msg up to cap)
  inboundCap: number;        // max inbound msg pts
  visitPoints: number;       // pts per visit
  visitsCap: number;         // max visits counted
  statusScores: Record<string, number>;
  recencyBrackets: { days: number; points: number }[];
  profilePoints: number;
  intentPoints: number;
  tagsCap: number;
  hotThreshold: number;      // score >= this → HOT
  warmThreshold: number;     // score >= this → WARM
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  emailPoints: 5,
  phonePoints: 5,
  messagesCap: 20,
  inboundCap: 10,
  visitPoints: 3,
  visitsCap: 5,
  statusScores: {
    NEW: 0, CONTACTED: 3, QUALIFIED: 7, VISIT: 10, NEGOTIATION: 13, WON: 15, LOST: 2,
  },
  recencyBrackets: [
    { days: 1, points: 15 },
    { days: 3, points: 12 },
    { days: 7, points: 8 },
    { days: 14, points: 4 },
    { days: 30, points: 2 },
  ],
  profilePoints: 5,
  intentPoints: 5,
  tagsCap: 5,
  hotThreshold: 60,
  warmThreshold: 30,
};
@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Load scoring config — uses DEFAULT, can be overridden per-tenant in future */
  private async getConfig(_tenantId: string): Promise<ScoringConfig> {
    // Future: load from tenant settings table or tenant.scoringConfig JSON
    // const tenant = await this.prisma.tenant.findUnique({
    //   where: { id: tenantId },
    //   select: { scoringConfig: true },
    // });
    // if (tenant?.scoringConfig) return { ...DEFAULT_SCORING_CONFIG, ...tenant.scoringConfig };

    // Allow global override via env
    const envOverride = process.env.SCORING_CONFIG;
    if (envOverride) {
      try {
        return { ...DEFAULT_SCORING_CONFIG, ...JSON.parse(envOverride) };
      } catch {
        this.logger.warn("SCORING_CONFIG env is invalid JSON, using defaults");
      }
    }
    return DEFAULT_SCORING_CONFIG;
  }

  /** Recalculate score for a single lead */
  async scoreLead(leadId: string, tenantId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        _count: {
          select: {
            messages: true,
            visits: true,
            tags: true,
          },
        },
        messages: {
          select: { direction: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        profile: { select: { id: true } },
      },
    });

    if (!lead) return null;

    const cfg = await this.getConfig(tenantId);
    let score = 0;

    // Contact info
    if (lead.email) score += cfg.emailPoints;
    if (lead.phone) score += cfg.phonePoints;

    // Messages volume
    const msgCount = lead._count.messages;
    score += Math.min(msgCount, cfg.messagesCap);

    // Inbound messages
    const inboundCount = lead.messages.filter((m) => m.direction === "IN").length;
    score += Math.min(inboundCount, cfg.inboundCap);

    // Visits
    score += Math.min(lead._count.visits, cfg.visitsCap) * cfg.visitPoints;

    // Status progression
    score += cfg.statusScores[lead.status] ?? 0;

    // Recency: how recently the lead had activity
    const lastMsgDate = lead.messages[0]?.createdAt;
    if (lastMsgDate) {
      const daysSince = (Date.now() - new Date(lastMsgDate).getTime()) / (1000 * 60 * 60 * 24);
      for (const bracket of cfg.recencyBrackets) {
        if (daysSince < bracket.days) {
          score += bracket.points;
          break;
        }
      }
    }

    // Has profile filled
    if (lead.profile) score += cfg.profilePoints;

    // Has intent
    if (lead.intent) score += cfg.intentPoints;

    // Tags
    score += Math.min(lead._count.tags, cfg.tagsCap);

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine temperature
    let temperature: LeadTemperature;
    if (score >= cfg.hotThreshold) temperature = LeadTemperature.HOT;
    else if (score >= cfg.warmThreshold) temperature = LeadTemperature.WARM;
    else temperature = LeadTemperature.COLD;

    // Update lead
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: { score, temperature },
      include: {
        stage: { select: { id: true, key: true, name: true, order: true } },
        assignee: { select: { id: true, name: true, email: true } },
        source: { select: { id: true, name: true, type: true } },
      },
    });

    return updated;
  }

  /** Recalculate all leads in a tenant — batched for performance */
  async scoreAllLeads(tenantId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId },
      select: { id: true },
    });

    let updated = 0;
    const BATCH_SIZE = 10;
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((lead) => this.scoreLead(lead.id, tenantId)));
      updated += batch.length;
    }

    return { updated };
  }

  /** Get scoring breakdown for a lead (for UI display) */
  async getScoringBreakdown(leadId: string, tenantId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        _count: { select: { messages: true, visits: true, tags: true } },
        messages: { select: { direction: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
        profile: { select: { id: true } },
      },
    });

    if (!lead) return null;

    const cfg = await this.getConfig(tenantId);
    const factors: { factor: string; points: number; maxPoints: number; detail: string }[] = [];

    factors.push({
      factor: "email",
      points: lead.email ? cfg.emailPoints : 0,
      maxPoints: cfg.emailPoints,
      detail: lead.email ? "Email proporcionado" : "Sin email",
    });

    factors.push({
      factor: "phone",
      points: lead.phone ? cfg.phonePoints : 0,
      maxPoints: cfg.phonePoints,
      detail: lead.phone ? "Teléfono proporcionado" : "Sin teléfono",
    });

    const msgPts = Math.min(lead._count.messages, cfg.messagesCap);
    factors.push({
      factor: "messages",
      points: msgPts,
      maxPoints: cfg.messagesCap,
      detail: `${lead._count.messages} mensajes totales`,
    });

    const inbound = lead.messages.filter((m) => m.direction === "IN").length;
    factors.push({
      factor: "inbound",
      points: Math.min(inbound, cfg.inboundCap),
      maxPoints: cfg.inboundCap,
      detail: `${inbound} mensajes entrantes`,
    });

    const visitPts = Math.min(lead._count.visits, cfg.visitsCap) * cfg.visitPoints;
    factors.push({
      factor: "visits",
      points: visitPts,
      maxPoints: cfg.visitsCap * cfg.visitPoints,
      detail: `${lead._count.visits} visitas programadas`,
    });

    factors.push({
      factor: "status",
      points: cfg.statusScores[lead.status] ?? 0,
      maxPoints: Math.max(...Object.values(cfg.statusScores)),
      detail: `Estado: ${lead.status}`,
    });

    const lastMsg = lead.messages[0]?.createdAt;
    let recencyPts = 0;
    let recencyDetail = "Sin actividad reciente";
    if (lastMsg) {
      const days = (Date.now() - new Date(lastMsg).getTime()) / (1000 * 60 * 60 * 24);
      for (const bracket of cfg.recencyBrackets) {
        if (days < bracket.days) {
          recencyPts = bracket.points;
          recencyDetail = days < 1 ? "Actividad hoy" :
            days < 3 ? "Actividad hace < 3 días" :
            days < 7 ? "Actividad esta semana" :
            days < 14 ? "Actividad hace < 2 semanas" :
            "Actividad hace < 1 mes";
          break;
        }
      }
    }
    factors.push({ factor: "recency", points: recencyPts, maxPoints: cfg.recencyBrackets[0]?.points ?? 15, detail: recencyDetail });

    factors.push({
      factor: "profile",
      points: lead.profile ? cfg.profilePoints : 0,
      maxPoints: cfg.profilePoints,
      detail: lead.profile ? "Perfil completado" : "Sin perfil",
    });

    factors.push({
      factor: "intent",
      points: lead.intent ? cfg.intentPoints : 0,
      maxPoints: cfg.intentPoints,
      detail: lead.intent ? `Intención: ${lead.intent}` : "Sin intención definida",
    });

    factors.push({
      factor: "tags",
      points: Math.min(lead._count.tags, cfg.tagsCap),
      maxPoints: cfg.tagsCap,
      detail: `${lead._count.tags} etiquetas`,
    });

    const total = factors.reduce((s, f) => s + f.points, 0);

    return {
      score: Math.min(100, total),
      temperature: total >= cfg.hotThreshold ? "HOT" : total >= cfg.warmThreshold ? "WARM" : "COLD",
      factors,
    };
  }
}
