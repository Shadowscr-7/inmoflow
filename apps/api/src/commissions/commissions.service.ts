import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, CommissionStatus, OperationType } from "@inmoflow/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Commission Rules (per operation type) ────────

  async getRules(tenantId: string) {
    return this.prisma.commissionRule.findMany({
      where: { tenantId },
      orderBy: { operationType: "asc" },
    });
  }

  async upsertRule(
    tenantId: string,
    data: {
      operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
      percentage: number;
      splitAgentPct?: number;
      splitBizPct?: number;
      enabled?: boolean;
    },
  ) {
    const agentPct = data.splitAgentPct ?? 50;
    const bizPct = data.splitBizPct ?? 100 - agentPct;
    return this.prisma.commissionRule.upsert({
      where: { tenantId_operationType: { tenantId, operationType: data.operationType } },
      create: {
        tenantId,
        operationType: data.operationType,
        percentage: data.percentage,
        splitAgentPct: agentPct,
        splitBizPct: bizPct,
        enabled: data.enabled ?? true,
      },
      update: {
        percentage: data.percentage,
        splitAgentPct: agentPct,
        splitBizPct: bizPct,
        enabled: data.enabled,
      },
    });
  }

  async deleteRule(tenantId: string, id: string) {
    const rule = await this.prisma.commissionRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException("Commission rule not found");
    return this.prisma.commissionRule.delete({ where: { id } });
  }

  // ─── Commissions CRUD ─────────────────────────────

  async findAll(
    tenantId: string,
    filters?: {
      agentId?: string;
      status?: string;
      operationType?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.CommissionWhereInput = { tenantId };
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.status) where.status = filters.status as CommissionStatus;
    if (filters?.operationType) where.operationType = filters.operationType as OperationType;
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [data, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.commission.count({ where }),
    ]);

    return { data, total, limit: filters?.limit ?? 50, offset: filters?.offset ?? 0 };
  }

  async findOne(tenantId: string, id: string) {
    const commission = await this.prisma.commission.findFirst({ where: { id, tenantId } });
    if (!commission) throw new NotFoundException("Commission not found");
    return commission;
  }

  async create(
    tenantId: string,
    data: {
      agentId: string;
      leadId?: string;
      propertyId?: string;
      operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
      dealAmount: number;
      commissionPct?: number;
      agentPct?: number;
      notes?: string;
    },
  ) {
    // Try to get rule defaults if percentages not overridden
    let commPct = data.commissionPct;
    let agentPct = data.agentPct;

    if (commPct === undefined || agentPct === undefined) {
      const rule = await this.prisma.commissionRule.findUnique({
        where: { tenantId_operationType: { tenantId, operationType: data.operationType } },
      });
      if (rule) {
        if (commPct === undefined) commPct = rule.percentage;
        if (agentPct === undefined) agentPct = rule.splitAgentPct;
      }
    }

    commPct = commPct ?? 3; // fallback 3%
    agentPct = agentPct ?? 50; // fallback 50/50

    const commissionTotal = Math.round(data.dealAmount * commPct / 100);
    const agentAmount = Math.round(commissionTotal * agentPct / 100);
    const bizAmount = commissionTotal - agentAmount;

    return this.prisma.commission.create({
      data: {
        tenantId,
        agentId: data.agentId,
        leadId: data.leadId || null,
        propertyId: data.propertyId || null,
        operationType: data.operationType,
        dealAmount: data.dealAmount,
        commissionPct: commPct,
        commissionTotal,
        agentPct,
        agentAmount,
        bizAmount,
        notes: data.notes || null,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      status?: "PENDING" | "APPROVED" | "PAID" | "CANCELLED";
      notes?: string;
      dealAmount?: number;
      commissionPct?: number;
      agentPct?: number;
    },
  ) {
    const existing = await this.prisma.commission.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Commission not found");

    const updateData: any = {};
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "PAID") updateData.paidAt = new Date();
    }
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Recalculate amounts if financial fields changed
    const dealAmount = data.dealAmount ?? existing.dealAmount;
    const commPct = data.commissionPct ?? existing.commissionPct;
    const agentPct = data.agentPct ?? existing.agentPct;

    if (data.dealAmount !== undefined || data.commissionPct !== undefined || data.agentPct !== undefined) {
      const commissionTotal = Math.round(dealAmount * commPct / 100);
      const agentAmount = Math.round(commissionTotal * agentPct / 100);
      Object.assign(updateData, {
        dealAmount,
        commissionPct: commPct,
        agentPct,
        commissionTotal,
        agentAmount,
        bizAmount: commissionTotal - agentAmount,
      });
    }

    return this.prisma.commission.update({ where: { id }, data: updateData });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.commission.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Commission not found");
    return this.prisma.commission.delete({ where: { id } });
  }

  // ─── Reporting / Summary ──────────────────────────

  async getSummary(tenantId: string, filters?: { agentId?: string; from?: string; to?: string }) {
    const where: Prisma.CommissionWhereInput = { tenantId };
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const all = await this.prisma.commission.findMany({ where });

    const byStatus = { PENDING: 0, APPROVED: 0, PAID: 0, CANCELLED: 0 };
    let totalCommission = 0;
    let totalAgentAmount = 0;
    let totalBizAmount = 0;
    let totalDeals = 0;
    const byAgent: Record<string, { deals: number; commission: number; agentAmount: number; status: Record<string, number> }> = {};
    const byOperation: Record<string, { deals: number; commission: number }> = {};

    for (const c of all) {
      if (c.status !== "CANCELLED") {
        totalCommission += c.commissionTotal;
        totalAgentAmount += c.agentAmount;
        totalBizAmount += c.bizAmount;
      }
      totalDeals++;

      byStatus[c.status as keyof typeof byStatus] = (byStatus[c.status as keyof typeof byStatus] || 0) + 1;

      // By agent
      if (!byAgent[c.agentId]) {
        byAgent[c.agentId] = { deals: 0, commission: 0, agentAmount: 0, status: {} };
      }
      byAgent[c.agentId].deals++;
      if (c.status !== "CANCELLED") {
        byAgent[c.agentId].commission += c.commissionTotal;
        byAgent[c.agentId].agentAmount += c.agentAmount;
      }
      byAgent[c.agentId].status[c.status] = (byAgent[c.agentId].status[c.status] || 0) + 1;

      // By operation type
      if (!byOperation[c.operationType]) {
        byOperation[c.operationType] = { deals: 0, commission: 0 };
      }
      byOperation[c.operationType].deals++;
      if (c.status !== "CANCELLED") {
        byOperation[c.operationType].commission += c.commissionTotal;
      }
    }

    return {
      totalDeals,
      totalCommission,
      totalAgentAmount,
      totalBizAmount,
      byStatus,
      byAgent,
      byOperation,
    };
  }
}
