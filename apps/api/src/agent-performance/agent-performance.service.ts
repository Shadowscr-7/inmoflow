import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadStatus } from "@inmoflow/db";

export interface AgentMetrics {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  // Core metrics
  totalLeads: number;
  newLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number; // %
  // Activity
  totalMessages: number;
  messagesSent: number;
  messagesReceived: number;
  totalVisits: number;
  completedVisits: number;
  // Speed
  avgResponseTimeMinutes: number | null;
  // Month goals
  goals: {
    leadsTarget: number;
    leadsActual: number;
    visitsTarget: number;
    visitsActual: number;
    wonTarget: number;
    wonActual: number;
  } | null;
}

@Injectable()
export class AgentPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get performance metrics for all agents in a tenant */
  async getTeamPerformance(tenantId: string, month?: string): Promise<AgentMetrics[]> {
    const currentMonth = month ?? new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
    const nextM = new Date(monthStart);
    nextM.setMonth(nextM.getMonth() + 1);
    const periodFilter = { gte: monthStart, lt: nextM };

    // Get all agents in this tenant (AGENT + BUSINESS roles)
    const agents = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: ["AGENT", "BUSINESS"] },
      },
      select: { id: true, name: true, email: true, role: true },
    });

    if (agents.length === 0) return [];
    const agentIds = agents.map((a) => a.id);

    // ── Batch queries across ALL agents at once (eliminates N+1) ──

    const [
      totalLeadsGroup,
      newLeadsGroup,
      wonLeadsGroup,
      lostLeadsGroup,
      messagesGroup,
      visitsGroup,
      goals,
    ] = await Promise.all([
      // Total assigned leads per agent (all time)
      this.prisma.lead.groupBy({
        by: ["assigneeId"],
        where: { tenantId, assigneeId: { in: agentIds } },
        _count: true,
      }),
      // New leads this month per agent
      this.prisma.lead.groupBy({
        by: ["assigneeId"],
        where: { tenantId, assigneeId: { in: agentIds }, createdAt: periodFilter },
        _count: true,
      }),
      // Won leads this month per agent
      this.prisma.lead.groupBy({
        by: ["assigneeId"],
        where: { tenantId, assigneeId: { in: agentIds }, status: LeadStatus.WON, updatedAt: periodFilter },
        _count: true,
      }),
      // Lost leads this month per agent
      this.prisma.lead.groupBy({
        by: ["assigneeId"],
        where: { tenantId, assigneeId: { in: agentIds }, status: LeadStatus.LOST, updatedAt: periodFilter },
        _count: true,
      }),
      // Messages by agent + direction this month
      this.prisma.message.groupBy({
        by: ["direction"],
        where: { tenantId, lead: { assigneeId: { in: agentIds } }, createdAt: periodFilter },
        _count: true,
      }),
      // Visits by agent + status this month
      this.prisma.visit.groupBy({
        by: ["agentId", "status"],
        where: { tenantId, agentId: { in: agentIds }, date: periodFilter },
        _count: true,
      }),
      // Goals for all agents
      this.prisma.agentGoal.findMany({
        where: { tenantId, userId: { in: agentIds }, month: currentMonth },
      }),
    ]);


    // For messages per agent, we need to query per agent (Prisma limitation on groupBy through relations)
    // But we batch them all in parallel instead of sequentially
    const msgPerAgent = await Promise.all(
      agentIds.map(async (agentId) => {
        const [total, sent, received] = await Promise.all([
          this.prisma.message.count({
            where: { tenantId, lead: { assigneeId: agentId }, createdAt: periodFilter },
          }),
          this.prisma.message.count({
            where: { tenantId, direction: "OUT", lead: { assigneeId: agentId }, createdAt: periodFilter },
          }),
          this.prisma.message.count({
            where: { tenantId, direction: "IN", lead: { assigneeId: agentId }, createdAt: periodFilter },
          }),
        ]);
        return { agentId, total, sent, received };
      }),
    );

    // Build lookup maps
    const totalLeadsMap = new Map(totalLeadsGroup.map((g) => [g.assigneeId, g._count]));
    const newLeadsMap = new Map(newLeadsGroup.map((g) => [g.assigneeId, g._count]));
    const wonLeadsMap = new Map(wonLeadsGroup.map((g) => [g.assigneeId, g._count]));
    const lostLeadsMap = new Map(lostLeadsGroup.map((g) => [g.assigneeId, g._count]));
    const msgMap = new Map(msgPerAgent.map((m) => [m.agentId, m]));
    const goalsMap = new Map(goals.map((g) => [g.userId, g]));

    // Visits per agent
    const visitsMap = new Map<string, { total: number; completed: number }>();
    for (const g of visitsGroup) {
      if (!g.agentId) continue;
      const entry = visitsMap.get(g.agentId) ?? { total: 0, completed: 0 };
      entry.total += g._count;
      if (g.status === "COMPLETED") entry.completed += g._count;
      visitsMap.set(g.agentId, entry);
    }

    // Build results for each agent
    const results: AgentMetrics[] = [];

    for (const agent of agents) {
      const totalLeads = totalLeadsMap.get(agent.id) ?? 0;
      const newLeads = newLeadsMap.get(agent.id) ?? 0;
      const wonLeads = wonLeadsMap.get(agent.id) ?? 0;
      const lostLeads = lostLeadsMap.get(agent.id) ?? 0;
      const msgs = msgMap.get(agent.id);
      const visits = visitsMap.get(agent.id);
      const goal = goalsMap.get(agent.id);

      const closedDeals = wonLeads + lostLeads;
      const conversionRate = closedDeals > 0 ? Math.round((wonLeads / closedDeals) * 100) : 0;

      // Calculate average response time (still needs per-lead, but batched)
      let avgResponseTimeMinutes: number | null = null;
      try {
        const leadsWithMessages = await this.prisma.lead.findMany({
          where: { tenantId, assigneeId: agent.id, createdAt: periodFilter },
          select: { id: true },
        });
        if (leadsWithMessages.length > 0) {
          const responseTimes: number[] = [];
          for (let b = 0; b < leadsWithMessages.length; b += 20) {
            const batch = leadsWithMessages.slice(b, b + 20);
            const pairs = await Promise.all(
              batch.map(async (lead) => {
                const [firstIn, firstOut] = await Promise.all([
                  this.prisma.message.findFirst({
                    where: { leadId: lead.id, direction: "IN" },
                    orderBy: { createdAt: "asc" },
                    select: { createdAt: true },
                  }),
                  this.prisma.message.findFirst({
                    where: { leadId: lead.id, direction: "OUT" },
                    orderBy: { createdAt: "asc" },
                    select: { createdAt: true },
                  }),
                ]);
                return { firstIn, firstOut };
              }),
            );
            for (const { firstIn, firstOut } of pairs) {
              if (firstIn && firstOut && firstOut.createdAt > firstIn.createdAt) {
                responseTimes.push(
                  (firstOut.createdAt.getTime() - firstIn.createdAt.getTime()) / 60_000,
                );
              }
            }
          }
          if (responseTimes.length > 0) {
            avgResponseTimeMinutes = Math.round(
              responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
            );
          }
        }
      } catch {
        // If response time calculation fails, leave as null
      }

      results.push({
        userId: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        totalLeads,
        newLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        totalMessages: msgs?.total ?? 0,
        messagesSent: msgs?.sent ?? 0,
        messagesReceived: msgs?.received ?? 0,
        totalVisits: visits?.total ?? 0,
        completedVisits: visits?.completed ?? 0,
        avgResponseTimeMinutes,
        goals: goal
          ? {
              leadsTarget: goal.leadsTarget,
              leadsActual: newLeads,
              visitsTarget: goal.visitsTarget,
              visitsActual: visits?.total ?? 0,
              wonTarget: goal.wonTarget,
              wonActual: wonLeads,
            }
          : null,
      });
    }

    // Sort by won leads descending (best performers first)
    results.sort((a, b) => b.wonLeads - a.wonLeads);
    return results;
  }

  /** Get performance for a single agent */
  async getAgentPerformance(tenantId: string, userId: string, month?: string): Promise<AgentMetrics | null> {
    const all = await this.getTeamPerformance(tenantId, month);
    return all.find((a) => a.userId === userId) ?? null;
  }

  /** Get leaderboard summary */
  async getLeaderboard(tenantId: string, month?: string) {
    const team = await this.getTeamPerformance(tenantId, month);

    return {
      byWon: [...team].sort((a, b) => b.wonLeads - a.wonLeads).slice(0, 10),
      byConversion: [...team].sort((a, b) => b.conversionRate - a.conversionRate).slice(0, 10),
      byVisits: [...team].sort((a, b) => b.completedVisits - a.completedVisits).slice(0, 10),
      byMessages: [...team].sort((a, b) => b.messagesSent - a.messagesSent).slice(0, 10),
    };
  }

  /** Set agent goals */
  async setGoal(
    tenantId: string,
    userId: string,
    month: string,
    data: { leadsTarget?: number; visitsTarget?: number; wonTarget?: number },
  ) {
    return this.prisma.agentGoal.upsert({
      where: { tenantId_userId_month: { tenantId, userId, month } },
      create: {
        tenantId,
        userId,
        month,
        leadsTarget: data.leadsTarget ?? 0,
        visitsTarget: data.visitsTarget ?? 0,
        wonTarget: data.wonTarget ?? 0,
      },
      update: {
        leadsTarget: data.leadsTarget,
        visitsTarget: data.visitsTarget,
        wonTarget: data.wonTarget,
      },
    });
  }
}
