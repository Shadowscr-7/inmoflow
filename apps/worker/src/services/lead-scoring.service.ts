import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadTemperature } from "@inmoflow/db";

/**
 * LeadScoringService (worker) — mirrors the API scoring algorithm.
 * Called automatically after lead events to keep scores up-to-date.
 */

const DEFAULT_CONFIG = {
  emailPoints: 5,
  phonePoints: 5,
  messagesCap: 20,
  inboundCap: 10,
  visitPoints: 3,
  visitsCap: 5,
  statusScores: { NEW: 0, CONTACTED: 3, QUALIFIED: 7, VISIT: 10, NEGOTIATION: 13, WON: 15, LOST: 2 } as Record<string, number>,
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

  async scoreLead(leadId: string, tenantId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        _count: { select: { messages: true, visits: true, tags: true } },
        messages: {
          select: { direction: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        profile: { select: { id: true } },
      },
    });

    if (!lead) return null;

    const cfg = DEFAULT_CONFIG;
    let score = 0;

    if (lead.email) score += cfg.emailPoints;
    if (lead.phone) score += cfg.phonePoints;

    score += Math.min(lead._count.messages, cfg.messagesCap);

    const inbound = lead.messages.filter((m) => m.direction === "IN").length;
    score += Math.min(inbound, cfg.inboundCap);

    score += Math.min(lead._count.visits, cfg.visitsCap) * cfg.visitPoints;
    score += cfg.statusScores[lead.status] ?? 0;

    const lastMsg = lead.messages[0]?.createdAt;
    if (lastMsg) {
      const daysSince = (Date.now() - new Date(lastMsg).getTime()) / 86_400_000;
      for (const b of cfg.recencyBrackets) {
        if (daysSince < b.days) { score += b.points; break; }
      }
    }

    if (lead.profile) score += cfg.profilePoints;
    if (lead.intent) score += cfg.intentPoints;
    score += Math.min(lead._count.tags, cfg.tagsCap);

    score = Math.max(0, Math.min(100, score));

    const temperature =
      score >= cfg.hotThreshold ? LeadTemperature.HOT :
      score >= cfg.warmThreshold ? LeadTemperature.WARM :
      LeadTemperature.COLD;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { score, temperature },
    });

    this.logger.debug(`Lead ${leadId} scored: ${score} (${temperature})`);
    return { score, temperature };
  }
}
