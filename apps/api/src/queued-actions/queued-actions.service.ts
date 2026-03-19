import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@inmoflow/db";

@Injectable()
export class QueuedActionsService {
  private readonly logger = new Logger(QueuedActionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters?: { status?: string; ruleId?: string; assigneeId?: string },
  ) {
    const where: Prisma.QueuedActionWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.ruleId) where.ruleId = filters.ruleId;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;

    return this.prisma.queuedAction.findMany({
      where,
      include: {
        rule: { select: { id: true, name: true, trigger: true, actions: true } },
      },
      // We also need lead name + assignee name for the UI.
      // QueuedAction doesn't have direct relations to Lead/User,
      // so we do a raw select via Prisma's $queryRaw or post-process.
      // For simplicity, we include the assigneeId and do a follow-up.
      orderBy: { createdAt: "desc" },
      take: 200,
    }).then(async (rows) => {
      // Enrich with lead name and assignee name
      if (rows.length === 0) return rows;

      const leadIds = [...new Set(rows.map((r) => r.leadId))];
      const assigneeIds = [...new Set(rows.map((r) => r.assigneeId).filter(Boolean))] as string[];

      const [leads, users] = await Promise.all([
        this.prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, name: true, phone: true },
        }),
        assigneeIds.length > 0
          ? this.prisma.user.findMany({
              where: { id: { in: assigneeIds } },
              select: { id: true, name: true, email: true },
            })
          : Promise.resolve([]),
      ]);

      const leadMap = new Map(leads.map((l) => [l.id, l]));
      const userMap = new Map(users.map((u) => [u.id, u]));

      return rows.map((row) => ({
        ...row,
        lead: leadMap.get(row.leadId) ?? null,
        assignee: row.assigneeId ? (userMap.get(row.assigneeId) ?? null) : null,
      }));
    });
  }

  async countPending(tenantId: string, assigneeId?: string) {
    const where: Prisma.QueuedActionWhereInput = { tenantId, status: "pending" };
    if (assigneeId) where.assigneeId = assigneeId;
    return this.prisma.queuedAction.count({ where });
  }

  async cancel(tenantId: string, id: string, assigneeId?: string) {
    const where: Prisma.QueuedActionWhereInput = { id, tenantId };
    if (assigneeId) where.assigneeId = assigneeId;
    const item = await this.prisma.queuedAction.findFirst({ where });
    if (!item) throw new NotFoundException("Queued action not found");
    if (item.status !== "pending") {
      throw new NotFoundException("Only pending actions can be cancelled");
    }

    return this.prisma.queuedAction.update({
      where: { id },
      data: { status: "cancelled" },
    });
  }

  async cancelAll(tenantId: string) {
    const result = await this.prisma.queuedAction.updateMany({
      where: { tenantId, status: "pending" },
      data: { status: "cancelled" },
    });
    return { cancelled: result.count };
  }

  /** Retry a failed action by resetting it to pending */
  async retry(tenantId: string, id: string, assigneeId?: string) {
    const where: Prisma.QueuedActionWhereInput = { id, tenantId };
    if (assigneeId) where.assigneeId = assigneeId;
    const item = await this.prisma.queuedAction.findFirst({ where });
    if (!item) throw new NotFoundException("Queued action not found");
    if (item.status !== "failed") {
      throw new NotFoundException("Only failed actions can be retried");
    }

    return this.prisma.queuedAction.update({
      where: { id },
      data: { status: "pending", error: null },
    });
  }
}
