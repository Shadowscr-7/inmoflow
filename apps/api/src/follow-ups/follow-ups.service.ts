import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters?: { limit?: number; offset?: number }) {
    const take = filters?.limit ?? 50;
    const skip = filters?.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.followUpSequence.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          steps: { orderBy: { order: "asc" } },
          _count: { select: { runs: true } },
        },
      }),
      this.prisma.followUpSequence.count({ where: { tenantId } }),
    ]);

    return { data, total, limit: take, offset: skip };
  }

  async findOne(tenantId: string, id: string) {
    const seq = await this.prisma.followUpSequence.findFirst({
      where: { id, tenantId },
      include: {
        steps: { orderBy: { order: "asc" } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { lead: { select: { id: true, name: true, phone: true } } },
        },
      },
    });
    if (!seq) throw new NotFoundException("Sequence not found");
    return seq;
  }

  async create(tenantId: string, dto: {
    name: string;
    trigger?: string;
    enabled?: boolean;
    steps: { order: number; delayHours: number; channel?: string; content: string }[];
  }) {
    return this.prisma.followUpSequence.create({
      data: {
        tenantId,
        name: dto.name,
        trigger: dto.trigger ?? "manual",
        enabled: dto.enabled ?? true,
        steps: {
          create: dto.steps.map((s) => ({
            order: s.order,
            delayHours: s.delayHours,
            channel: s.channel,
            content: s.content,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  }

  async update(tenantId: string, id: string, dto: {
    name?: string;
    trigger?: string;
    enabled?: boolean;
    steps?: { order: number; delayHours: number; channel?: string; content: string }[];
  }) {
    const seq = await this.prisma.followUpSequence.findFirst({ where: { id, tenantId } });
    if (!seq) throw new NotFoundException("Sequence not found");

    // If steps provided, replace them all
    if (dto.steps) {
      await this.prisma.followUpStep.deleteMany({ where: { sequenceId: id } });
    }

    return this.prisma.followUpSequence.update({
      where: { id },
      data: {
        name: dto.name,
        trigger: dto.trigger,
        enabled: dto.enabled,
        ...(dto.steps
          ? {
              steps: {
                create: dto.steps.map((s) => ({
                  order: s.order,
                  delayHours: s.delayHours,
                  channel: s.channel,
                  content: s.content,
                })),
              },
            }
          : {}),
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const seq = await this.prisma.followUpSequence.findFirst({ where: { id, tenantId } });
    if (!seq) throw new NotFoundException("Sequence not found");
    await this.prisma.followUpSequence.delete({ where: { id } });
  }

  // ─── Run management ─────────────────────────────

  async enrollLead(tenantId: string, sequenceId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");
    const seq = await this.prisma.followUpSequence.findFirst({
      where: { id: sequenceId, tenantId },
      include: { steps: { orderBy: { order: "asc" }, take: 1 } },
    });
    if (!seq) throw new NotFoundException("Sequence not found");

    const firstStep = seq.steps[0];
    const nextRunAt = firstStep
      ? new Date(Date.now() + firstStep.delayHours * 3600000)
      : null;

    return this.prisma.followUpRun.create({
      data: {
        tenantId,
        sequenceId,
        leadId,
        currentStep: 0,
        status: "ACTIVE",
        nextRunAt,
      },
    });
  }

  async cancelRun(tenantId: string, runId: string) {
    const run = await this.prisma.followUpRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException("Run not found");
    return this.prisma.followUpRun.update({
      where: { id: runId },
      data: { status: "CANCELLED" },
    });
  }

  async getActiveRuns(tenantId: string) {
    return this.prisma.followUpRun.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { nextRunAt: "asc" },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
        sequence: { select: { id: true, name: true } },
      },
    });
  }
}
