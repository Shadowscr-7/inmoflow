import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { LeadSourceType, EventType } from "@inmoflow/db";
import { PlanService } from "../plan/plan.service";
import { randomUUID } from "crypto";

@Injectable()
export class LeadSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly planService: PlanService,
  ) {}

  async findAll(tenantId: string, type?: LeadSourceType) {
    if (!tenantId) return [];

    return this.prisma.leadSource.findMany({
      where: {
        tenantId,
        ...(type ? { type } : {}),
      },
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(tenantId: string, id: string) {
    const source = await this.prisma.leadSource.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { leads: true } } },
    });
    if (!source) throw new NotFoundException("LeadSource not found");
    return source;
  }

  /**
   * Find a META source by pageId + formId (used by webhook).
   */
  async findByMetaMapping(pageId: string, formId: string) {
    return this.prisma.leadSource.findFirst({
      where: {
        type: LeadSourceType.META_LEAD_AD,
        metaPageId: pageId,
        metaFormId: formId,
        enabled: true,
      },
    });
  }

  async create(tenantId: string, dto: {
    type: LeadSourceType;
    name: string;
    metaPageId?: string;
    metaFormId?: string;
    webFormKey?: string;
  }) {
    // Check Meta Leads plan access
    if (dto.type === LeadSourceType.META_LEAD_AD) {
      await this.planService.checkMetaLeadsAccess(tenantId);
    }

    // Check unique constraint for META
    if (dto.type === LeadSourceType.META_LEAD_AD && dto.metaPageId && dto.metaFormId) {
      const existing = await this.prisma.leadSource.findFirst({
        where: {
          tenantId,
          type: LeadSourceType.META_LEAD_AD,
          metaPageId: dto.metaPageId,
          metaFormId: dto.metaFormId,
        },
      });
      if (existing) {
        throw new ConflictException(
          `A META source for pageId=${dto.metaPageId} formId=${dto.metaFormId} already exists`,
        );
      }
    }

    // Generate apiKey for WEBHOOK type
    const apiKey = dto.type === LeadSourceType.WEBHOOK
      ? randomUUID().replace(/-/g, "")
      : undefined;

    const source = await this.prisma.leadSource.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        metaPageId: dto.metaPageId,
        metaFormId: dto.metaFormId,
        webFormKey: dto.webFormKey,
        apiKey,
        enabled: true,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "LeadSource",
      entityId: source.id,
      message: `LeadSource created: ${dto.name} (${dto.type})`,
    });

    return source;
  }

  async update(tenantId: string, id: string, dto: {
    name?: string;
    enabled?: boolean;
    metaPageId?: string;
    metaFormId?: string;
  }) {
    const source = await this.findById(tenantId, id);

    return this.prisma.leadSource.update({
      where: { id: source.id },
      data: dto,
    });
  }

  /**
   * Regenerate the apiKey for a WEBHOOK source.
   */
  async regenerateApiKey(tenantId: string, id: string) {
    const source = await this.findById(tenantId, id);
    if (source.type !== "WEBHOOK") {
      throw new ConflictException("Only WEBHOOK sources have API keys");
    }
    const newKey = randomUUID().replace(/-/g, "");
    return this.prisma.leadSource.update({
      where: { id: source.id },
      data: { apiKey: newKey },
      include: { _count: { select: { leads: true } } },
    });
  }

  async delete(tenantId: string, id: string) {
    const source = await this.findById(tenantId, id);
    await this.prisma.leadSource.delete({ where: { id: source.id } });
  }
}
