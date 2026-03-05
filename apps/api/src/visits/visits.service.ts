import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { VisitStatus } from "@inmoflow/db";

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters?: {
    from?: string;
    to?: string;
    agentId?: string;
    status?: VisitStatus;
    leadId?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.status) where.status = filters.status;
    if (filters?.leadId) where.leadId = filters.leadId;

    return this.prisma.visit.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        property: { select: { id: true, title: true, address: true } },
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, tenantId },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        property: { select: { id: true, title: true, address: true, slug: true } },
      },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    return visit;
  }

  async create(tenantId: string, dto: {
    leadId: string;
    propertyId?: string;
    agentId?: string;
    date: string;
    endDate?: string;
    notes?: string;
    address?: string;
  }) {
    // Verify lead
    const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");

    return this.prisma.visit.create({
      data: {
        tenantId,
        leadId: dto.leadId,
        propertyId: dto.propertyId || undefined,
        agentId: dto.agentId || undefined,
        date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
        address: dto.address,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        property: { select: { id: true, title: true, address: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: {
    propertyId?: string;
    agentId?: string;
    date?: string;
    endDate?: string;
    status?: VisitStatus;
    notes?: string;
    address?: string;
  }) {
    const visit = await this.prisma.visit.findFirst({ where: { id, tenantId } });
    if (!visit) throw new NotFoundException("Visit not found");

    return this.prisma.visit.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        property: { select: { id: true, title: true, address: true } },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id, tenantId } });
    if (!visit) throw new NotFoundException("Visit not found");
    await this.prisma.visit.delete({ where: { id } });
  }

  // Stats for dashboard
  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [todayCount, weekCount, byStatus] = await Promise.all([
      this.prisma.visit.count({ where: { tenantId, date: { gte: today, lt: tomorrow } } }),
      this.prisma.visit.count({ where: { tenantId, date: { gte: today, lt: weekEnd } } }),
      this.prisma.visit.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return {
      today: todayCount,
      thisWeek: weekCount,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    };
  }
}
