import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { EvolutionProvider } from "../channels/providers/evolution.provider";
import { TelegramProvider } from "../channels/providers/telegram.provider";
import { MessageChannel, MessageDirection, EventType, ChannelStatus } from "@inmoflow/db";

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
    private readonly evolution: EvolutionProvider,
    private readonly telegram: TelegramProvider,
    @InjectQueue("message") private readonly messageQueue: Queue,
  ) {}

  /**
   * Full message history with filters (for the Messages admin page).
   */
  async findHistory(
    tenantId: string,
    filters: {
      direction?: "IN" | "OUT";
      status?: string;
      channel?: string;
      assigneeId?: string;
      from?: string;
      to?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId };

    if (filters.direction) where.direction = filters.direction;
    if (filters.channel) where.channel = filters.channel;

    // Status filter: "sent", "failed", "queued"
    if (filters.status === "failed") {
      where.status = "failed";
    } else if (filters.status === "sent") {
      where.status = "sent";
    } else if (filters.status === "queued") {
      where.status = "queued";
    }

    // Filter by assignee (lead's assigned agent)
    if (filters.assigneeId) {
      where.lead = { assigneeId: filters.assigneeId };
    }

    // Date range
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    // Text search in content or lead phone/name
    if (filters.search) {
      where.OR = [
        { content: { contains: filters.search, mode: "insensitive" } },
        { to: { contains: filters.search, mode: "insensitive" } },
        { from: { contains: filters.search, mode: "insensitive" } },
        { lead: { name: { contains: filters.search, mode: "insensitive" } } },
        { lead: { phone: { contains: filters.search, mode: "insensitive" } } },
      ];
    }

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  /**
   * List messages for a lead (conversation view).
   */
  async findByLead(tenantId: string, leadId: string, limit = 50, offset = 0) {
    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { tenantId, leadId },
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.message.count({ where: { tenantId, leadId } }),
    ]);
    return { data, total, limit, offset };
  }

  /**
   * Send a message to a lead through the appropriate channel.
   */
  async send(
    tenantId: string,
    leadId: string,
    dto: { content: string; channel?: MessageChannel },
  ) {
    // Get lead
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    // Determine which channel to use
    const channel = dto.channel ?? lead.primaryChannel;
    if (!channel) {
      throw new BadRequestException("No channel specified and lead has no primaryChannel");
    }

    let providerMessageId: string | undefined;
    let to: string | undefined;

    if (channel === MessageChannel.WHATSAPP) {
      to = lead.whatsappFrom ?? lead.phone ?? undefined;
      if (!to) throw new BadRequestException("Lead has no WhatsApp number");

      // Find WA channel — MUST use assigned agent's channel. Only fallback for unassigned leads.
      let waChannel = lead.assigneeId
        ? await this.prisma.channel.findFirst({
            where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
          })
        : null;
      if (!waChannel && lead.assigneeId) {
        // Assigned agent has no connected WA channel — fail instead of sending from wrong agent
        const disconnected = await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP" },
        });
        const reason = disconnected
          ? `El canal WhatsApp del agente asignado está desconectado (estado: ${disconnected.status})`
          : "El agente asignado no tiene un canal WhatsApp configurado";
        throw new BadRequestException(reason);
      }
      if (!waChannel) {
        waChannel = await this.prisma.channel.findFirst({
          where: { tenantId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
        });
      }
      if (!waChannel?.providerInstanceId) {
        throw new BadRequestException("WhatsApp channel not connected");
      }

      const result = await this.evolution.sendText(
        waChannel.providerInstanceId,
        to,
        dto.content,
      ) as { key?: { id?: string } };
      providerMessageId = result?.key?.id;
    } else if (channel === MessageChannel.TELEGRAM) {
      // Find TG channel — MUST use assigned agent's channel. Only fallback for unassigned leads.
      let tgChannel = lead.assigneeId
        ? await this.prisma.channel.findFirst({
            where: { tenantId, userId: lead.assigneeId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
          })
        : null;
      if (!tgChannel && lead.assigneeId) {
        const reason = "El agente asignado no tiene un canal Telegram conectado";
        throw new BadRequestException(reason);
      }
      if (!tgChannel) {
        tgChannel = await this.prisma.channel.findFirst({
          where: { tenantId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
        });
      }
      if (!tgChannel?.telegramChatId) {
        throw new BadRequestException("Telegram channel not connected");
      }

      // For Telegram: we send to the chatId (group or direct where bot is connected)
      // The actual recipient is identified by telegramUserId on the lead
      to = lead.telegramUserId ?? tgChannel.telegramChatId;
      const result = await this.telegram.sendMessage(
        tgChannel.telegramChatId,
        dto.content,
      ) as { result?: { message_id?: number } };
      providerMessageId = result?.result?.message_id
        ? String(result.result.message_id)
        : undefined;
    } else {
      throw new BadRequestException(`Sending via ${channel} not supported yet`);
    }

    // Save outbound message
    const message = await this.prisma.message.create({
      data: {
        tenantId,
        leadId,
        direction: MessageDirection.OUT,
        channel,
        to,
        content: dto.content,
        providerMessageId,
        status: "sent",
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.message_sent,
      entity: "Message",
      entityId: message.id,
      message: `Message sent via ${channel} to ${to}`,
      payload: { leadId, channel, to },
    });

    // ── Auto-deactivate AI conversation when an agent sends manually ──
    // This means the human is taking over the conversation.
    if (lead.aiConversationActive) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { aiConversationActive: false },
      });

      await this.eventLog.log({
        tenantId,
        type: EventType.workflow_executed,
        entity: "Lead",
        entityId: leadId,
        message: `AI conversation deactivated — agent sent manual message`,
        payload: { reason: "agent_manual_message" },
      });

      this.logger.log(`AI conversation deactivated for lead ${leadId} — agent took over`);
    }

    return message;
  }

  /**
   * Sync inbound messages from Evolution API for a specific lead.
   * Fetches messages from the provider and imports any we don't already have.
   */
  async syncInbound(tenantId: string, leadId: string): Promise<{ synced: number }> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const rawPhone = lead.whatsappFrom ?? lead.phone;
    if (!rawPhone) return { synced: 0 };

    // Strip + prefix — WhatsApp JIDs use bare numbers
    const phone = rawPhone.replace(/^\+/, "");

    // Find WA channel — MUST use assigned agent's channel. Only fallback for unassigned leads.
    let waChannel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
        })
      : null;
    if (!waChannel && lead.assigneeId) {
      // Assigned agent has no connected WA channel — can't sync from wrong agent's channel
      this.logger.warn(`syncInbound: assigned agent (${lead.assigneeId}) has no connected WA channel for lead ${leadId}`);
      return { synced: 0 };
    }
    if (!waChannel) {
      waChannel = await this.prisma.channel.findFirst({
        where: { tenantId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
      });
    }
    if (!waChannel?.providerInstanceId) return { synced: 0 };

    // Build the remote JID — add @s.whatsapp.net if not present
    const remoteJid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;

    try {
      const evoMessages = await this.evolution.fetchMessages(
        waChannel.providerInstanceId,
        remoteJid,
        200,
      );

      if (!evoMessages.length) return { synced: 0 };

      // Get existing provider message IDs to avoid duplicates
      const existingIds = new Set(
        (
          await this.prisma.message.findMany({
            where: { tenantId, leadId, providerMessageId: { not: null } },
            select: { providerMessageId: true },
          })
        ).map((m) => m.providerMessageId),
      );

      let synced = 0;

      for (const evoMsg of evoMessages) {
        const msgId = evoMsg.key?.id;
        if (!msgId || existingIds.has(msgId)) continue;

        const direction = evoMsg.key.fromMe ? MessageDirection.OUT : MessageDirection.IN;
        const content =
          evoMsg.message?.conversation ??
          evoMsg.message?.extendedTextMessage?.text ??
          null;

        // Skip protocol/system messages without content
        if (!content) continue;

        // We mainly care about inbound messages we missed (but also store outbound for completeness)
        const ts = evoMsg.messageTimestamp
          ? new Date(
              typeof evoMsg.messageTimestamp === "number" && evoMsg.messageTimestamp < 1e12
                ? evoMsg.messageTimestamp * 1000
                : evoMsg.messageTimestamp,
            )
          : new Date();

        const savedMsg = await this.prisma.message.create({
          data: {
            tenantId,
            leadId,
            direction,
            channel: MessageChannel.WHATSAPP,
            from: direction === "IN" ? phone : undefined,
            to: direction === "OUT" ? phone : undefined,
            content,
            providerMessageId: msgId,
            status: direction === "OUT" ? "sent" : undefined,
            createdAt: ts,
          },
        });

        // Emit inbound event so rules engine and AI auto-reply can process it
        if (direction === MessageDirection.IN) {
          await this.eventProducer.emitMessageInbound(tenantId, leadId, savedMsg.id, "WHATSAPP", content);
        }

        synced++;
      }

      if (synced > 0) {
        this.logger.log(`Synced ${synced} messages for lead ${leadId.slice(0, 8)} from Evolution API`);
      }

      return { synced };
    } catch (err) {
      this.logger.error(`syncInbound error: ${(err as Error).message}`);
      return { synced: 0 };
    }
  }

  /**
   * Retry a failed message by re-queuing it for delivery.
   */
  async retryMessage(
    tenantId: string,
    leadId: string,
    messageId: string,
  ): Promise<{ queued: boolean }> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, tenantId, leadId },
    });

    if (!message) throw new NotFoundException("Message not found");
    if (message.status !== "failed") {
      throw new BadRequestException("Solo se pueden reintentar mensajes fallidos");
    }

    // Reset status to queued
    await this.prisma.message.update({
      where: { id: messageId },
      data: { status: "queued", error: null },
    });

    // Queue for delivery via the worker
    await this.messageQueue.add(
      "message.retry",
      { messageId, retryAttempt: 0 },
      { delay: 1000 }, // small delay to let the status update settle
    );

    this.logger.log(`Message ${messageId} re-queued for retry`);
    return { queued: true };
  }
}
