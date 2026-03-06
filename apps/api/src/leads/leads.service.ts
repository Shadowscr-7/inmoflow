import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { LeadStatus, EventType, Prisma } from "@inmoflow/db";

export interface CreateLeadDto {
  name?: string;
  phone?: string;
  email?: string;
  status?: LeadStatus;
  stageKey?: string;
  assigneeId?: string;
  sourceId?: string;
  intent?: string;
  notes?: string;
}

export interface UpdateLeadDto {
  name?: string;
  phone?: string;
  email?: string;
  status?: LeadStatus;
  stageKey?: string;
  assigneeId?: string | null;
  intent?: string;
  score?: number;
  notes?: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  stageId?: string;
  assigneeId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CurrentUserInfo {
  userId: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
  ) {}

  async create(tenantId: string, dto: CreateLeadDto) {
    // Resolve stage from key if provided
    let stageId: string | undefined;
    if (dto.stageKey) {
      const stage = await this.prisma.leadStage.findUnique({
        where: { tenantId_key: { tenantId, key: dto.stageKey } },
      });
      stageId = stage?.id;
    }

    // If no stage specified, use default (NEW)
    if (!stageId) {
      const defaultStage = await this.prisma.leadStage.findFirst({
        where: { tenantId, isDefault: true },
      });
      stageId = defaultStage?.id;
    }

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        status: dto.status ?? LeadStatus.NEW,
        stageId,
        assigneeId: dto.assigneeId,
        sourceId: dto.sourceId,
        intent: dto.intent,
        notes: dto.notes,
      },
      include: {
        stage: true,
        assignee: { select: { id: true, name: true, email: true } },
        source: true,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "lead",
      entityId: lead.id,
      message: `Lead created: ${lead.name ?? lead.phone ?? lead.email ?? "unknown"}`,
      payload: { status: lead.status, stageKey: dto.stageKey },
    });

    // Enqueue for async rule processing
    await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
      sourceType: lead.source?.type,
      status: lead.status,
    });

    return lead;
  }

  async findAll(tenantId: string, filters: LeadFilters, currentUser?: CurrentUserInfo) {
    if (!tenantId) return { data: [], total: 0, limit: filters.limit ?? 25, offset: filters.offset ?? 0 };

    console.log('[LeadsService.findAll] currentUser:', JSON.stringify(currentUser));

    const where: Prisma.LeadWhereInput = { tenantId };

    if (filters.status) where.status = filters.status;
    if (filters.stageId) where.stageId = filters.stageId;

    // AGENT role: only see their own assigned leads
    if (currentUser?.role === 'AGENT') {
      where.assigneeId = currentUser.userId;
      console.log('[LeadsService.findAll] AGENT isolation applied, assigneeId:', currentUser.userId);
    } else if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { phone: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Clamp pagination to prevent abuse
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          stage: true,
          assignee: { select: { id: true, name: true, email: true } },
          source: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async findById(tenantId: string, leadId: string, currentUser?: CurrentUserInfo) {
    const whereClause: Prisma.LeadWhereInput = { id: leadId, tenantId };
    // AGENT role: can only see their own leads
    if (currentUser?.role === 'AGENT') {
      whereClause.assigneeId = currentUser.userId;
    }
    const lead = await this.prisma.lead.findFirst({
      where: whereClause,
      include: {
        stage: true,
        assignee: { select: { id: true, name: true, email: true } },
        source: true,
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
        profile: true,
      },
    });

    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async update(tenantId: string, leadId: string, dto: UpdateLeadDto) {
    const existing = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { stage: true },
    });
    if (!existing) throw new NotFoundException("Lead not found");

    const data: Prisma.LeadUpdateInput = {};
    const changes: Record<string, unknown> = {};

    if (dto.name !== undefined) { data.name = dto.name; changes.name = dto.name; }
    if (dto.phone !== undefined) { data.phone = dto.phone; changes.phone = dto.phone; }
    if (dto.email !== undefined) { data.email = dto.email; changes.email = dto.email; }
    if (dto.intent !== undefined) { data.intent = dto.intent; changes.intent = dto.intent; }
    if (dto.score !== undefined) { data.score = dto.score; changes.score = dto.score; }
    if (dto.notes !== undefined) { data.notes = dto.notes; changes.notes = dto.notes; }
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
      changes.assigneeId = dto.assigneeId;
    }

    // Handle status change
    if (dto.status && dto.status !== existing.status) {
      data.status = dto.status;
      changes.statusFrom = existing.status;
      changes.statusTo = dto.status;
    }

    // Handle stage change by key
    if (dto.stageKey) {
      const newStage = await this.prisma.leadStage.findUnique({
        where: { tenantId_key: { tenantId, key: dto.stageKey } },
      });
      if (newStage && newStage.id !== existing.stageId) {
        data.stage = { connect: { id: newStage.id } };
        changes.stageFrom = existing.stage?.key;
        changes.stageTo = dto.stageKey;
      }
    }

    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data,
      include: {
        stage: true,
        assignee: { select: { id: true, name: true, email: true } },
        source: true,
      },
    });

    if (Object.keys(changes).length > 0) {
      await this.eventLog.log({
        tenantId,
        type: EventType.lead_updated,
        entity: "lead",
        entityId: leadId,
        message: `Lead updated: ${Object.keys(changes).join(", ")}`,
        payload: changes,
      });

      // Enqueue for async rule processing
      await this.eventProducer.emitLeadUpdated(tenantId, leadId, changes);
    }

    return updated;
  }

  async delete(tenantId: string, leadId: string) {
    const existing = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!existing) throw new NotFoundException("Lead not found");

    await this.prisma.lead.delete({ where: { id: leadId } });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_updated,
      entity: "lead",
      entityId: leadId,
      message: `Lead deleted: ${existing.name ?? existing.phone ?? existing.email ?? leadId}`,
    });
  }

  async getStages(tenantId: string) {
    if (!tenantId) return [];

    return this.prisma.leadStage.findMany({
      where: { tenantId },
      orderBy: { order: "asc" },
      include: {
        _count: { select: { leads: true } },
      },
    });
  }

  async getLeadsByStage(tenantId: string, currentUser?: CurrentUserInfo) {
    if (!tenantId) return [];

    // AGENT role: only see their own leads in the pipeline
    const leadsWhere: Prisma.LeadWhereInput = currentUser?.role === 'AGENT'
      ? { assigneeId: currentUser.userId }
      : {};

    const stages = await this.prisma.leadStage.findMany({
      where: { tenantId },
      orderBy: { order: "asc" },
      include: {
        leads: {
          where: leadsWhere,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { leads: { where: leadsWhere } } },
      },
    });
    return stages;
  }

  // ─── Pipeline Stages CRUD ─────────────────────────

  async createStage(
    tenantId: string,
    data: { key: string; name: string; order?: number; isDefault?: boolean },
  ) {
    // Check uniqueness
    const existing = await this.prisma.leadStage.findUnique({
      where: { tenantId_key: { tenantId, key: data.key } },
    });
    if (existing) throw new ConflictException(`Stage "${data.key}" already exists`);

    // Auto-assign order if not provided
    let order = data.order;
    if (order === undefined) {
      const max = await this.prisma.leadStage.findFirst({
        where: { tenantId },
        orderBy: { order: "desc" },
      });
      order = (max?.order ?? -1) + 1;
    }

    return this.prisma.leadStage.create({
      data: {
        tenantId,
        key: data.key,
        name: data.name,
        order,
        isDefault: data.isDefault ?? false,
      },
      include: { _count: { select: { leads: true } } },
    });
  }

  async updateStage(
    tenantId: string,
    stageId: string,
    data: { key?: string; name?: string; order?: number; isDefault?: boolean },
  ) {
    const stage = await this.prisma.leadStage.findFirst({
      where: { id: stageId, tenantId },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    // Check key uniqueness if changing
    if (data.key && data.key !== stage.key) {
      const dup = await this.prisma.leadStage.findUnique({
        where: { tenantId_key: { tenantId, key: data.key } },
      });
      if (dup) throw new ConflictException(`Stage "${data.key}" already exists`);
    }

    return this.prisma.leadStage.update({
      where: { id: stageId },
      data: {
        ...(data.key !== undefined && { key: data.key }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
      include: { _count: { select: { leads: true } } },
    });
  }

  async deleteStage(tenantId: string, stageId: string) {
    const stage = await this.prisma.leadStage.findFirst({
      where: { id: stageId, tenantId },
      include: { _count: { select: { leads: true } } },
    });
    if (!stage) throw new NotFoundException("Stage not found");
    if (stage._count.leads > 0) {
      throw new BadRequestException(
        `No se puede eliminar "${stage.name}" porque tiene ${stage._count.leads} lead(s) asignados. Muévelos antes.`,
      );
    }

    await this.prisma.leadStage.delete({ where: { id: stageId } });
  }

  async reorderStages(tenantId: string, ids: string[]) {
    // Update each stage's order based on position in the array
    const updates = ids.map((id, idx) =>
      this.prisma.leadStage.updateMany({
        where: { id, tenantId },
        data: { order: idx },
      }),
    );
    await this.prisma.$transaction(updates);

    return this.getStages(tenantId);
  }

  async getTimeline(tenantId: string, leadId: string, currentUser?: CurrentUserInfo) {
    // Verify lead belongs to tenant (and to agent if AGENT role)
    const whereClause: Prisma.LeadWhereInput = { id: leadId, tenantId };
    if (currentUser?.role === 'AGENT') {
      whereClause.assigneeId = currentUser.userId;
    }
    const lead = await this.prisma.lead.findFirst({
      where: whereClause,
    });
    if (!lead) throw new NotFoundException("Lead not found");

    return this.prisma.eventLog.findMany({
      where: { tenantId, entity: "lead", entityId: leadId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
