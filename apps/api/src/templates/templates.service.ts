import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventType, MessageChannel, Prisma } from "@inmoflow/db";

export interface TemplateAttachment {
  url: string;
  originalName: string;
  mimeType: string;
  size?: number;
}

export interface CreateTemplateDto {
  key: string;
  name: string;
  channel?: MessageChannel;
  content: string;
  attachments?: TemplateAttachment[];
  enabled?: boolean;
}

export interface UpdateTemplateDto {
  name?: string;
  channel?: MessageChannel | null;
  content?: string;
  attachments?: TemplateAttachment[];
  enabled?: boolean;
  global?: boolean;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
  ) {}

  /** All templates for a tenant (admin view) — includes user relation */
  async findAll(tenantId: string, filters?: { enabled?: boolean; channel?: MessageChannel }) {
    if (!tenantId) return [];

    const where: Prisma.TemplateWhereInput = { tenantId };
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;
    if (filters?.channel) where.channel = filters.channel;

    return this.prisma.template.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { key: "asc" },
    });
  }

  /** Templates visible to a specific user: their own + global (userId == null) */
  async findForUser(
    tenantId: string,
    userId: string,
    filters?: { enabled?: boolean; channel?: MessageChannel },
  ) {
    if (!tenantId) return [];

    const where: Prisma.TemplateWhereInput = {
      tenantId,
      OR: [{ userId }, { userId: null }],
    };
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;
    if (filters?.channel) where.channel = filters.channel;

    return this.prisma.template.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { key: "asc" },
    });
  }

  async findById(tenantId: string, id: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, tenantId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  async findByKey(tenantId: string, key: string) {
    return this.prisma.template.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  }

  async create(tenantId: string, dto: CreateTemplateDto, userId?: string) {
    const existing = await this.prisma.template.findUnique({
      where: { tenantId_key: { tenantId, key: dto.key } },
    });
    if (existing) {
      throw new ConflictException(`Template with key "${dto.key}" already exists`);
    }

    const template = await this.prisma.template.create({
      data: {
        tenantId,
        userId: userId ?? null,
        key: dto.key,
        name: dto.name,
        channel: dto.channel,
        content: dto.content,
        attachments: dto.attachments ? (dto.attachments as any) : undefined,
        enabled: dto.enabled ?? true,
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.template_created,
      entity: "Template",
      entityId: template.id,
      message: `Template created: ${template.name} (${template.key})`,
    });

    return template;
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto, userId?: string, userRole?: string) {
    const existing = await this.findById(tenantId, id);

    // Handle global flag: if user is BUSINESS/ADMIN, they can toggle global
    let userIdUpdate: string | null | undefined = undefined;
    if (dto.global !== undefined && userId && ["BUSINESS", "ADMIN"].includes(userRole ?? "")) {
      userIdUpdate = dto.global ? null : userId;
    }

    const template = await this.prisma.template.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.channel !== undefined && { channel: dto.channel }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.attachments !== undefined && { attachments: dto.attachments as any }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(userIdUpdate !== undefined && { userId: userIdUpdate }),
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.template_updated,
      entity: "Template",
      entityId: template.id,
      message: `Template updated: ${template.name}`,
    });

    return template;
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.prisma.template.delete({ where: { id: existing.id } });

    await this.eventLog.log({
      tenantId,
      type: EventType.template_deleted,
      entity: "Template",
      entityId: id,
      message: `Template deleted: ${existing.name}`,
    });
  }

  /**
   * Render a template by replacing {{placeholders}} with actual values.
   */
  renderContent(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return variables[key] ?? `{{${key}}}`;
    });
  }
}
