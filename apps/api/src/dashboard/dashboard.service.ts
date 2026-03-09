import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadStatus } from "@inmoflow/db";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─── Parallel queries ────────────────────────────
    const [
      totalLeads,
      leadsToday,
      leadsThisWeek,
      leadsThisMonth,
      wonLeads,
      lostLeads,
      leadsByStatus,
      pipelineStages,
      activeChannels,
      totalChannels,
      totalMessages,
      messagesIn,
      messagesOut,
      totalUsers,
      activeRules,
      totalTemplates,
      recentLeads,
      recentActivity,
      leadsBySourceRaw,
      leadsByDay,
    ] = await Promise.all([
      // Total leads
      this.prisma.lead.count({ where: { tenantId } }),
      // Leads today
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      // Leads this week
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      // Leads this month
      this.prisma.lead.count({ where: { tenantId, createdAt: { gte: monthAgo } } }),
      // Won leads
      this.prisma.lead.count({ where: { tenantId, status: LeadStatus.WON } }),
      // Lost leads
      this.prisma.lead.count({ where: { tenantId, status: LeadStatus.LOST } }),
      // Leads grouped by status
      this.prisma.lead.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { id: true },
      }),
      // Pipeline stages with lead count
      this.prisma.leadStage.findMany({
        where: { tenantId },
        orderBy: { order: "asc" },
        include: { _count: { select: { leads: true } } },
      }),
      // Active channels
      this.prisma.channel.count({ where: { tenantId, status: "CONNECTED" } }),
      // Total channels
      this.prisma.channel.count({ where: { tenantId } }),
      // Total messages
      this.prisma.message.count({ where: { tenantId } }),
      // Messages inbound
      this.prisma.message.count({ where: { tenantId, direction: "IN" } }),
      // Messages outbound
      this.prisma.message.count({ where: { tenantId, direction: "OUT" } }),
      // Total users
      this.prisma.user.count({ where: { tenantId, isActive: true } }),
      // Active rules
      this.prisma.rule.count({ where: { tenantId, enabled: true } }),
      // Total templates
      this.prisma.template.count({ where: { tenantId, enabled: true } }),
      // Recent leads (last 5)
      this.prisma.lead.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          stage: { select: { name: true, key: true } },
          assignee: { select: { name: true, email: true } },
          source: { select: { name: true, type: true } },
        },
      }),
      // Recent activity (last 8)
      this.prisma.eventLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      // Leads grouped by source (efficient aggregation)
      this.prisma.lead.groupBy({
        by: ["sourceId"],
        where: { tenantId, sourceId: { not: null } },
        _count: { id: true },
      }),
      // Leads created per day in last 30 days
      this.prisma.lead.findMany({
        where: { tenantId, createdAt: { gte: monthAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // ─── Process leadsBySource ────────────────────────
    const sourceMap: Record<string, number> = {};
    let leadsWithSource = 0;
    if (leadsBySourceRaw.length > 0) {
      // Resolve source names
      const sourceIds = leadsBySourceRaw.map((g) => g.sourceId).filter(Boolean) as string[];
      const sources = sourceIds.length > 0
        ? await this.prisma.leadSource.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, name: true },
          })
        : [];
      const sourceNameMap = new Map(sources.map((s) => [s.id, s.name]));

      for (const g of leadsBySourceRaw) {
        const name = sourceNameMap.get(g.sourceId!) ?? "Sin fuente";
        sourceMap[name] = (sourceMap[name] ?? 0) + g._count.id;
        leadsWithSource += g._count.id;
      }
    }
    // Add "Sin fuente" for leads with no source
    const leadsNoSource = totalLeads - leadsWithSource;
    if (leadsNoSource > 0) {
      sourceMap["Sin fuente"] = (sourceMap["Sin fuente"] ?? 0) + leadsNoSource;
    }
    const leadsBySource = Object.entries(sourceMap).map(([name, count]) => ({ name, count }));

    // ─── Process leads per day (last 14 days) ────────
    const dayMap: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = 0;
    }
    for (const l of leadsByDay) {
      const key = l.createdAt.toISOString().slice(0, 10);
      if (dayMap[key] !== undefined) {
        dayMap[key]++;
      }
    }
    const leadsTimeline = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    // ─── Conversion rate ─────────────────────────────
    const closedLeads = wonLeads + lostLeads;
    const conversionRate = closedLeads > 0 ? ((wonLeads / closedLeads) * 100) : 0;

    // ─── Status map ──────────────────────────────────
    const statusCounts: Record<string, number> = {};
    for (const s of leadsByStatus) {
      statusCounts[s.status] = s._count.id;
    }

    // ─── Pipeline ────────────────────────────────────
    const pipeline = pipelineStages.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      order: s.order,
      count: s._count.leads,
    }));

    return {
      summary: {
        totalLeads,
        leadsToday,
        leadsThisWeek,
        leadsThisMonth,
        wonLeads,
        lostLeads,
        conversionRate: Number(conversionRate.toFixed(1)),
        activeChannels,
        totalChannels,
        totalMessages,
        messagesIn,
        messagesOut,
        totalUsers,
        activeRules,
        totalTemplates,
      },
      statusCounts,
      pipeline,
      leadsBySource,
      leadsTimeline,
      recentLeads: recentLeads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        status: l.status,
        score: l.score,
        stage: l.stage?.name ?? null,
        assignee: l.assignee?.name ?? l.assignee?.email ?? null,
        source: l.source?.name ?? null,
        createdAt: l.createdAt,
      })),
      recentActivity: recentActivity.map((e) => ({
        id: e.id,
        type: e.type,
        entity: e.entity,
        message: e.message,
        createdAt: e.createdAt,
      })),
    };
  }
}
