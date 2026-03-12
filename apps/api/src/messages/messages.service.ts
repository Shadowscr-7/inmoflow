import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EvolutionProvider } from "../channels/providers/evolution.provider";
import { TelegramProvider } from "../channels/providers/telegram.provider";
import { MessageChannel, MessageDirection, EventType, ChannelStatus } from "@inmoflow/db";

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly evolution: EvolutionProvider,
    private readonly telegram: TelegramProvider,
  ) {}

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

      // Find WA channel — prefer the assigned agent's channel, fallback to any tenant channel
      let waChannel = lead.assigneeId
        ? await this.prisma.channel.findFirst({
            where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
          })
        : null;
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
      // Find TG channel — prefer assigned agent's channel, fallback to any
      let tgChannel = lead.assigneeId
        ? await this.prisma.channel.findFirst({
            where: { tenantId, userId: lead.assigneeId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
          })
        : null;
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

    // Find WA channel — prefer the assigned agent's channel, fallback to any tenant channel
    let waChannel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
        })
      : null;
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

        await this.prisma.message.create({
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
}
