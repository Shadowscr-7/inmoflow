import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleCalendarService } from "../calendar/google-calendar.service";
import { Prisma, VisitStatus, LeadStatus } from "@inmoflow/db";

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async findAll(tenantId: string, filters?: {
    from?: string;
    to?: string;
    agentId?: string;
    status?: VisitStatus;
    leadId?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.VisitWhereInput = { tenantId };
    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.status) where.status = filters.status;
    if (filters?.leadId) where.leadId = filters.leadId;

    const take = filters?.limit ?? 100;
    const skip = filters?.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        orderBy: { date: "asc" },
        take,
        skip,
        include: {
          lead: { select: { id: true, name: true, phone: true, email: true } },
          property: { select: { id: true, title: true, address: true } },
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    return { data, total, limit: take, offset: skip };
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
    leadId?: string;
    newLeadName?: string;
    newLeadPhone?: string;
    newLeadEmail?: string;
    propertyId?: string;
    agentId?: string;
    date: string;
    endDate?: string;
    notes?: string;
    address?: string;
    sendWhatsappReminder?: boolean;
  }) {
    let leadId: string;

    if (dto.leadId) {
      // Verify existing lead belongs to tenant
      const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId } });
      if (!lead) throw new NotFoundException("Lead not found");
      leadId = dto.leadId;
    } else {
      // Auto-create a new lead — require at least name or phone
      if (!dto.newLeadName && !dto.newLeadPhone && !dto.newLeadEmail) {
        throw new BadRequestException("Provide leadId or at least one of: newLeadName, newLeadPhone, newLeadEmail");
      }

      // Find the "visita" stage in this tenant's pipeline
      let stageId: string | undefined;
      const visitStage = await this.prisma.leadStage.findFirst({
        where: { tenantId, key: "visita" },
      });
      if (visitStage) {
        stageId = visitStage.id;
      } else {
        // Fall back to default stage
        const defaultStage = await this.prisma.leadStage.findFirst({
          where: { tenantId, isDefault: true },
        });
        stageId = defaultStage?.id;
      }

      const newLead = await this.prisma.lead.create({
        data: {
          tenantId,
          name: dto.newLeadName,
          phone: dto.newLeadPhone,
          email: dto.newLeadEmail,
          status: LeadStatus.VISIT,
          stageId,
          assigneeId: dto.agentId || undefined,
        },
      });
      leadId = newLead.id;
    }

    const visit = await this.prisma.visit.create({
      data: {
        tenantId,
        leadId,
        propertyId: dto.propertyId || undefined,
        agentId: dto.agentId || undefined,
        date: new Date(dto.date),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
        address: dto.address,
        sendWhatsappReminder: dto.sendWhatsappReminder ?? false,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        property: { select: { id: true, title: true, address: true } },
      },
    });

    // Sync to Google Calendar (async, non-blocking)
    if (visit.agentId) {
      this.syncCreateToGoogle(visit).catch((e) =>
        this.logger.warn(`Google Calendar sync failed: ${e}`),
      );
    }

    return visit;
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

    const updated = await this.prisma.visit.update({
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

    // Sync update to Google Calendar
    if (updated.agentId && updated.googleEventId) {
      this.googleCalendar
        .updateEvent(updated.agentId, updated.googleEventId, {
          date: updated.date,
          endDate: updated.endDate,
          address: updated.address,
          notes: updated.notes,
          leadName: updated.lead?.name,
          propertyTitle: updated.property?.title,
          status: updated.status,
        })
        .catch((e) => this.logger.warn(`Google Calendar update sync failed: ${e}`));
    }

    return updated;
  }

  async remove(tenantId: string, id: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id, tenantId } });
    if (!visit) throw new NotFoundException("Visit not found");

    // Delete from Google Calendar first
    if (visit.agentId && visit.googleEventId) {
      this.googleCalendar
        .deleteEvent(visit.agentId, visit.googleEventId)
        .catch((e) => this.logger.warn(`Google Calendar delete sync failed: ${e}`));
    }

    await this.prisma.visit.delete({ where: { id } });
  }

  // ─── Google Calendar Sync Helper ─────────────────────

  private async syncCreateToGoogle(visit: {
    id: string;
    agentId: string | null;
    date: Date;
    endDate: Date | null;
    address: string | null;
    notes: string | null;
    createdByAi: boolean;
    lead?: { name: string | null } | null;
    property?: { title: string | null } | null;
  }) {
    if (!visit.agentId) return;

    const eventId = await this.googleCalendar.createEvent(visit.agentId, {
      id: visit.id,
      date: visit.date,
      endDate: visit.endDate,
      address: visit.address,
      notes: visit.notes,
      leadName: visit.lead?.name,
      propertyTitle: visit.property?.title,
      createdByAi: visit.createdByAi,
    });

    // Store the Google event ID on the visit
    if (eventId) {
      await this.prisma.visit.update({
        where: { id: visit.id },
        data: { googleEventId: eventId },
      });
    }
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
