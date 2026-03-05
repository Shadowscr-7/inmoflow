import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { ChannelType, ChannelStatus, EventType } from "@inmoflow/db";
import { PlanService } from "../plan/plan.service";

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly planService: PlanService,
  ) {}

  /** All channels for the tenant (admin view) */
  async findAll(tenantId: string) {
    return this.prisma.channel.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Channels owned by a specific user */
  async findByUser(tenantId: string, userId: string) {
    return this.prisma.channel.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(tenantId: string, id: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id, tenantId },
    });
    if (!channel) throw new NotFoundException("Channel not found");
    return channel;
  }

  /** Find channel for a specific user + type */
  async findByUserAndType(tenantId: string, userId: string, type: ChannelType) {
    return this.prisma.channel.findFirst({
      where: { tenantId, userId, type },
    });
  }

  /** Find any channel of a given type in this tenant (for webhooks routing) */
  async findByType(tenantId: string, type: ChannelType) {
    return this.prisma.channel.findFirst({
      where: { tenantId, type },
    });
  }

  async create(tenantId: string, userId: string, dto: { type: ChannelType }) {
    // Check plan channel access
    await this.planService.checkChannelAccess(tenantId, dto.type);

    // One channel per type per user
    const existing = await this.prisma.channel.findFirst({
      where: { tenantId, userId, type: dto.type },
    });
    if (existing) {
      throw new ConflictException(`You already have a ${dto.type} channel`);
    }

    const channel = await this.prisma.channel.create({
      data: {
        tenantId,
        userId,
        type: dto.type,
        status: ChannelStatus.CONNECTING,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.channel_connected,
      entity: "Channel",
      entityId: channel.id,
      message: `Channel ${dto.type} created for user ${userId}`,
    });

    return channel;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: ChannelStatus,
    extra?: { providerInstanceId?: string; telegramChatId?: string; lastError?: string },
  ) {
    const channel = await this.findById(tenantId, id);

    const updated = await this.prisma.channel.update({
      where: { id: channel.id },
      data: {
        status,
        ...extra,
      },
    });

    const eventType =
      status === ChannelStatus.CONNECTED
        ? EventType.channel_connected
        : status === ChannelStatus.DISCONNECTED
          ? EventType.channel_disconnected
          : EventType.provider_error;

    await this.eventLog.log({
      tenantId,
      type: eventType,
      entity: "Channel",
      entityId: channel.id,
      message: `Channel ${channel.type} → ${status}`,
      payload: extra as Record<string, unknown> | undefined,
    });

    return updated;
  }

  async disconnect(tenantId: string, id: string) {
    return this.updateStatus(tenantId, id, ChannelStatus.DISCONNECTED);
  }

  async delete(tenantId: string, id: string) {
    const channel = await this.findById(tenantId, id);
    await this.prisma.channel.delete({ where: { id: channel.id } });

    await this.eventLog.log({
      tenantId,
      type: EventType.channel_disconnected,
      entity: "Channel",
      entityId: channel.id,
      message: `Channel ${channel.type} deleted`,
    });
  }
}
