import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadTemperature } from "@inmoflow/db";

/**
 * Lead Scoring — calculates a 0-100 score for each lead
 * based on activity signals, then assigns a temperature label.
 *
 * Scoring factors (weights sum to 100):
 *  - hasEmail          → 5
 *  - hasPhone          → 5
 *  - messagesCount     → up to 20  (cap at 20 msgs)
 *  - messagesInbound   → up to 10  (lead initiated)
 *  - visitCount        → up to 15  (cap at 5 visits)
 *  - statusProgression → up to 15
 *  - recency           → up to 15  (last activity within days)
 *  - hasProfile        → 5
 *  - hasIntent         → 5
 *  - tagCount          → up to 5
 */
@Injectable()
export class LeadScoringService {
  constructor(private readonly prisma: PrismaService) {}

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

    let score = 0;

    // Contact info
    if (lead.email) score += 5;
    if (lead.phone) score += 5;

    // Messages volume (up to 20 pts, cap at 20 msgs)
    const msgCount = lead._count.messages;
    score += Math.min(msgCount, 20);

    // Inbound messages (up to 10 pts)
    const inboundCount = lead.messages.filter((m) => m.direction === "IN").length;
    score += Math.min(inboundCount, 10);

    // Visits (up to 15 pts, 3 pts per visit, cap 5)
    score += Math.min(lead._count.visits, 5) * 3;

    // Status progression (max 15 pts)
    const STATUS_SCORE: Record<string, number> = {
      NEW: 0,
      CONTACTED: 3,
      QUALIFIED: 7,
      VISIT: 10,
      NEGOTIATION: 13,
      WON: 15,
      LOST: 2,
    };
    score += STATUS_SCORE[lead.status] ?? 0;

    // Recency: how recently the lead had activity (max 15 pts)
    const lastMsgDate = lead.messages[0]?.createdAt;
    if (lastMsgDate) {
      const daysSince = (Date.now() - new Date(lastMsgDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) score += 15;
      else if (daysSince < 3) score += 12;
      else if (daysSince < 7) score += 8;
      else if (daysSince < 14) score += 4;
      else if (daysSince < 30) score += 2;
    }

    // Has profile filled
    if (lead.profile) score += 5;

    // Has intent
    if (lead.intent) score += 5;

    // Tags (up to 5 pts)
    score += Math.min(lead._count.tags, 5);

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine temperature
    let temperature: LeadTemperature;
    if (score >= 60) temperature = LeadTemperature.HOT;
    else if (score >= 30) temperature = LeadTemperature.WARM;
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

  /** Recalculate all leads in a tenant */
  async scoreAllLeads(tenantId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { tenantId },
      select: { id: true },
    });

    let updated = 0;
    for (const lead of leads) {
      await this.scoreLead(lead.id, tenantId);
      updated++;
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

    const factors: { factor: string; points: number; maxPoints: number; detail: string }[] = [];

    factors.push({
      factor: "email",
      points: lead.email ? 5 : 0,
      maxPoints: 5,
      detail: lead.email ? "Email proporcionado" : "Sin email",
    });

    factors.push({
      factor: "phone",
      points: lead.phone ? 5 : 0,
      maxPoints: 5,
      detail: lead.phone ? "Teléfono proporcionado" : "Sin teléfono",
    });

    const msgPts = Math.min(lead._count.messages, 20);
    factors.push({
      factor: "messages",
      points: msgPts,
      maxPoints: 20,
      detail: `${lead._count.messages} mensajes totales`,
    });

    const inbound = lead.messages.filter((m) => m.direction === "IN").length;
    factors.push({
      factor: "inbound",
      points: Math.min(inbound, 10),
      maxPoints: 10,
      detail: `${inbound} mensajes entrantes`,
    });

    const visitPts = Math.min(lead._count.visits, 5) * 3;
    factors.push({
      factor: "visits",
      points: visitPts,
      maxPoints: 15,
      detail: `${lead._count.visits} visitas programadas`,
    });

    const STATUS_SCORE: Record<string, number> = {
      NEW: 0, CONTACTED: 3, QUALIFIED: 7, VISIT: 10, NEGOTIATION: 13, WON: 15, LOST: 2,
    };
    factors.push({
      factor: "status",
      points: STATUS_SCORE[lead.status] ?? 0,
      maxPoints: 15,
      detail: `Estado: ${lead.status}`,
    });

    const lastMsg = lead.messages[0]?.createdAt;
    let recencyPts = 0;
    let recencyDetail = "Sin actividad reciente";
    if (lastMsg) {
      const days = (Date.now() - new Date(lastMsg).getTime()) / (1000 * 60 * 60 * 24);
      if (days < 1) { recencyPts = 15; recencyDetail = "Actividad hoy"; }
      else if (days < 3) { recencyPts = 12; recencyDetail = "Actividad hace < 3 días"; }
      else if (days < 7) { recencyPts = 8; recencyDetail = "Actividad esta semana"; }
      else if (days < 14) { recencyPts = 4; recencyDetail = "Actividad hace < 2 semanas"; }
      else if (days < 30) { recencyPts = 2; recencyDetail = "Actividad hace < 1 mes"; }
    }
    factors.push({ factor: "recency", points: recencyPts, maxPoints: 15, detail: recencyDetail });

    factors.push({
      factor: "profile",
      points: lead.profile ? 5 : 0,
      maxPoints: 5,
      detail: lead.profile ? "Perfil completado" : "Sin perfil",
    });

    factors.push({
      factor: "intent",
      points: lead.intent ? 5 : 0,
      maxPoints: 5,
      detail: lead.intent ? `Intención: ${lead.intent}` : "Sin intención definida",
    });

    factors.push({
      factor: "tags",
      points: Math.min(lead._count.tags, 5),
      maxPoints: 5,
      detail: `${lead._count.tags} etiquetas`,
    });

    const total = factors.reduce((s, f) => s + f.points, 0);

    return {
      score: Math.min(100, total),
      temperature: total >= 60 ? "HOT" : total >= 30 ? "WARM" : "COLD",
      factors,
    };
  }
}
