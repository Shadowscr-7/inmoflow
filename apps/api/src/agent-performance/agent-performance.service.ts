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

    // Get all agents in this tenant (AGENT + BUSINESS roles)
    const agents = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: ["AGENT", "BUSINESS"] },
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const results: AgentMetrics[] = [];

    for (const agent of agents) {
      const periodFilter = { gte: monthStart, lt: nextM };

      const [
        totalLeads,
        newLeads,
        wonLeads,
        lostLeads,
        totalMessages,
        messagesSent,
        messagesReceived,
        totalVisits,
        completedVisits,
        goals,
      ] = await Promise.all([
        // Total assigned leads
        this.prisma.lead.count({
          where: { tenantId, assigneeId: agent.id },
        }),
        // New leads this month
        this.prisma.lead.count({
          where: { tenantId, assigneeId: agent.id, createdAt: periodFilter },
        }),
        // Won leads this month
        this.prisma.lead.count({
          where: { tenantId, assigneeId: agent.id, status: LeadStatus.WON, updatedAt: periodFilter },
        }),
        // Lost leads this month
        this.prisma.lead.count({
          where: { tenantId, assigneeId: agent.id, status: LeadStatus.LOST, updatedAt: periodFilter },
        }),
        // Total messages for this agent's leads
        this.prisma.message.count({
          where: { tenantId, lead: { assigneeId: agent.id }, createdAt: periodFilter },
        }),
        // Messages sent (OUT)
        this.prisma.message.count({
          where: { tenantId, direction: "OUT", lead: { assigneeId: agent.id }, createdAt: periodFilter },
        }),
        // Messages received (IN)
        this.prisma.message.count({
          where: { tenantId, direction: "IN", lead: { assigneeId: agent.id }, createdAt: periodFilter },
        }),
        // Total visits
        this.prisma.visit.count({
          where: { tenantId, agentId: agent.id, date: periodFilter },
        }),
        // Completed visits
        this.prisma.visit.count({
          where: { tenantId, agentId: agent.id, status: "COMPLETED", date: periodFilter },
        }),
        // Goals for this month
        this.prisma.agentGoal.findUnique({
          where: { tenantId_userId_month: { tenantId, userId: agent.id, month: currentMonth } },
        }),
      ]);

      const closedDeals = wonLeads + lostLeads;
      const conversionRate = closedDeals > 0 ? Math.round((wonLeads / closedDeals) * 100) : 0;

      // Calculate average response time: time between first IN message and first OUT for each lead
      let avgResponseTimeMinutes: number | null = null;
      try {
        const leadsWithMessages = await this.prisma.lead.findMany({
          where: { tenantId, assigneeId: agent.id, createdAt: periodFilter },
          select: { id: true },
        });
        if (leadsWithMessages.length > 0) {
          const responseTimes: number[] = [];
          // Process in batches of 20 to avoid excessive load
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
        totalMessages,
        messagesSent,
        messagesReceived,
        totalVisits,
        completedVisits,
        avgResponseTimeMinutes,
        goals: goals
          ? {
              leadsTarget: goals.leadsTarget,
              leadsActual: newLeads,
              visitsTarget: goals.visitsTarget,
              visitsActual: totalVisits,
              wonTarget: goals.wonTarget,
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
