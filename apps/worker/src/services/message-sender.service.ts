import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ChannelStatus, MessageChannel } from "@inmoflow/db";

/**
 * MessageSenderService — sends queued messages through the correct provider.
 *
 * Determines which channel to use based on the lead's assigned agent,
 * falling back to any connected tenant channel.
 * If the assigned agent's channel is unavailable, retries once after 3 minutes.
 *
 * Providers supported: WhatsApp (Evolution API), Telegram.
 */
@Injectable()
export class MessageSenderService {
  private readonly logger = new Logger(MessageSenderService.name);

  /** Delay before retrying a message when the agent's channel is not available (ms) */
  private readonly RETRY_DELAY_MS = 3 * 60 * 1000; // 3 minutes
  /** Max retry attempts for agent-channel-unavailable errors */
  private readonly MAX_CHANNEL_RETRIES = 1;

  // Evolution API settings
  private readonly evoBaseUrl: string;
  private readonly evoApiKey: string;

  // Telegram settings
  private readonly tgBotToken: string;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("message") private readonly messageQueue: Queue,
  ) {
    const raw = process.env.EVOLUTION_API_URL ?? "";
    this.evoBaseUrl = raw.replace(/\/+$/, "") || "http://localhost:8080";
    this.evoApiKey = process.env.EVOLUTION_API_KEY ?? "";
    this.tgBotToken = process.env.TELEGRAM_BOT_TOKEN ?? "";

    if (!process.env.EVOLUTION_API_URL) {
      this.logger.warn("EVOLUTION_API_URL not set — using http://localhost:8080 fallback");
    }
    if (!process.env.EVOLUTION_API_KEY) {
      this.logger.warn("EVOLUTION_API_KEY not set — WhatsApp sending will fail");
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram sending will fail");
    }
  }

  /**
   * Send a single queued message by ID.
   * @param retryAttempt Current retry attempt (0 = first try, 1 = retry).
   * Returns true if sent successfully, false otherwise.
   */
  async sendQueuedMessage(messageId: string, retryAttempt = 0): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { lead: true },
    });

    if (!message) {
      this.logger.warn(`Message ${messageId} not found`);
      return false;
    }

    if (message.status !== "queued") {
      this.logger.debug(`Message ${messageId} status is "${message.status}", skipping`);
      return false;
    }

    const lead = message.lead;
    if (!lead) {
      this.logger.warn(`Lead not found for message ${messageId}`);
      await this.markFailed(messageId, "Lead not found");
      return false;
    }

    try {
      if (message.channel === MessageChannel.WHATSAPP) {
        return await this.sendWhatsApp(message.id, message.tenantId, lead, message.content, retryAttempt, message.mediaUrl, message.mediaType);
      } else if (message.channel === MessageChannel.TELEGRAM) {
        return await this.sendTelegram(message.id, message.tenantId, lead, message.content, retryAttempt, message.mediaUrl, message.mediaType);
      } else {
        this.logger.debug(`Channel ${message.channel} does not support auto-send`);
        return false;
      }
    } catch (err) {
      const errMsg = (err as Error).message ?? "Unknown error";
      this.logger.error(`Failed to send message ${messageId}: ${errMsg}`);
      await this.markFailed(messageId, errMsg);
      return false;
    }
  }

  private async sendWhatsApp(
    messageId: string,
    tenantId: string,
    lead: { assigneeId: string | null; whatsappFrom: string | null; phone: string | null; aiDemoMode?: boolean; aiDemoPhone?: string | null },
    content: string,
    retryAttempt = 0,
    mediaUrl?: string | null,
    mediaType?: string | null,
  ): Promise<boolean> {
    // In AI demo mode, redirect messages to the test phone number
    const isDemoRedirect = !!(lead.aiDemoMode && lead.aiDemoPhone);
    const phone = isDemoRedirect
      ? lead.aiDemoPhone
      : (lead.whatsappFrom ?? lead.phone);
    if (!phone) {
      await this.markFailed(messageId, "Lead has no WhatsApp number");
      return false;
    }

    if (isDemoRedirect) {
      this.logger.log(`AI DEMO MODE: redirecting message ${messageId.slice(0, 8)} to test phone ${lead.aiDemoPhone}`);
    }

    // Find channel — MUST use assigned agent's channel. Only fallback for unassigned leads.
    let channel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
        })
      : null;
    if (!channel && lead.assigneeId) {
      // Assigned agent has no connected WhatsApp channel — check if one exists but disconnected
      const disconnected = await this.prisma.channel.findFirst({
        where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP" },
      });
      const reason = disconnected
        ? `Assigned agent's WhatsApp channel exists but is not connected (status: ${disconnected.status})`
        : `Assigned agent (${lead.assigneeId}) has no WhatsApp channel configured`;

      // Schedule a retry if we haven't exhausted attempts
      if (retryAttempt < this.MAX_CHANNEL_RETRIES) {
        this.logger.warn(
          `Message ${messageId}: ${reason}. Scheduling retry #${retryAttempt + 1} in ${this.RETRY_DELAY_MS / 1000}s…`,
        );
        await this.messageQueue.add(
          "message.retry",
          { messageId, retryAttempt: retryAttempt + 1 },
          { delay: this.RETRY_DELAY_MS },
        );
        return false;
      }

      this.logger.warn(`Message ${messageId}: ${reason}. No retries left — marking as failed.`);
      await this.markFailed(messageId, reason);
      return false;
    }
    if (!channel) {
      // No assignee — fallback to any connected tenant channel
      channel = await this.prisma.channel.findFirst({
        where: { tenantId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
      });
    }

    if (!channel?.providerInstanceId) {
      await this.markFailed(messageId, "No connected WhatsApp channel");
      return false;
    }

    // Format number for Evolution API
    const to = phone.replace(/^\+/, "").replace(/[^0-9]/g, "");

    // Call Evolution API — sendMedia if media is present, else sendText
    let url: string;
    let body: Record<string, unknown>;

    if (mediaUrl && mediaType) {
      url = `${this.evoBaseUrl}/message/sendMedia/${channel.providerInstanceId}`;
      body = {
        number: to,
        mediatype: mediaType,
        media: mediaUrl,
        caption: content,
      };
    } else {
      url = `${this.evoBaseUrl}/message/sendText/${channel.providerInstanceId}`;
      body = {
        number: to,
        text: content,
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.evoApiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Evolution API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as { key?: { id?: string } };
    const providerMessageId = data?.key?.id;

    // Mark as sent
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: "sent",
        to,
        providerMessageId,
      },
    });

    this.logger.log(
      `WhatsApp message sent: ${messageId.slice(0, 8)} → ${to} via ${channel.providerInstanceId}`,
    );
    return true;
  }

  private async sendTelegram(
    messageId: string,
    tenantId: string,
    lead: { assigneeId: string | null; telegramUserId: string | null },
    content: string,
    retryAttempt = 0,
    mediaUrl?: string | null,
    mediaType?: string | null,
  ): Promise<boolean> {
    if (!this.tgBotToken) {
      await this.markFailed(messageId, "Telegram bot token not configured");
      return false;
    }

    // Find channel — MUST use assigned agent's channel. Only fallback for unassigned leads.
    let channel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
        })
      : null;
    if (!channel && lead.assigneeId) {
      const reason = `Assigned agent (${lead.assigneeId}) has no connected Telegram channel`;

      // Schedule a retry if we haven't exhausted attempts
      if (retryAttempt < this.MAX_CHANNEL_RETRIES) {
        this.logger.warn(
          `Message ${messageId}: ${reason}. Scheduling retry #${retryAttempt + 1} in ${this.RETRY_DELAY_MS / 1000}s…`,
        );
        await this.messageQueue.add(
          "message.retry",
          { messageId, retryAttempt: retryAttempt + 1 },
          { delay: this.RETRY_DELAY_MS },
        );
        return false;
      }

      this.logger.warn(`Message ${messageId}: ${reason}. No retries left — marking as failed.`);
      await this.markFailed(messageId, reason);
      return false;
    }
    if (!channel) {
      channel = await this.prisma.channel.findFirst({
        where: { tenantId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
      });
    }

    if (!channel?.telegramChatId) {
      await this.markFailed(messageId, "No connected Telegram channel");
      return false;
    }

    const chatId = lead.telegramUserId ?? channel.telegramChatId;

    // Send media if present, then send text
    if (mediaUrl && mediaType) {
      const methodMap: Record<string, { method: string; field: string }> = {
        image: { method: "sendPhoto", field: "photo" },
        video: { method: "sendVideo", field: "video" },
        audio: { method: "sendAudio", field: "audio" },
        document: { method: "sendDocument", field: "document" },
      };
      const { method, field } = methodMap[mediaType] ?? methodMap.document;
      const mediaRes = await fetch(`https://api.telegram.org/bot${this.tgBotToken}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          [field]: mediaUrl,
          ...(content && { caption: content }),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!mediaRes.ok) {
        const errText = await mediaRes.text().catch(() => "");
        throw new Error(`Telegram API ${mediaRes.status}: ${errText.slice(0, 200)}`);
      }
      const data = (await mediaRes.json()) as { result?: { message_id?: number } };
      const providerMessageId = data?.result?.message_id ? String(data.result.message_id) : undefined;

      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: "sent", to: chatId, providerMessageId },
      });
      this.logger.log(`Telegram media sent: ${messageId.slice(0, 8)} → ${chatId}`);
      return true;
    }

    const url = `https://api.telegram.org/bot${this.tgBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: content }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Telegram API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as { result?: { message_id?: number } };
    const providerMessageId = data?.result?.message_id ? String(data.result.message_id) : undefined;

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: "sent",
        to: chatId,
        providerMessageId,
      },
    });

    this.logger.log(`Telegram message sent: ${messageId.slice(0, 8)} → ${chatId}`);
    return true;
  }

  private async markFailed(messageId: string, error: string) {
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { status: "failed", error },
      include: { lead: { select: { id: true, name: true, assigneeId: true, tenantId: true } } },
    });

    const lead = message.lead;
    if (!lead) return;

    // Log event for activity page
    try {
      await this.prisma.eventLog.create({
        data: {
          tenantId: lead.tenantId,
          type: "provider_error",
          entity: "Message",
          entityId: messageId,
          status: "error",
          message: `Fallo al enviar mensaje a ${lead.name ?? "lead"}: ${error}`,
          payload: { messageId, leadId: lead.id, error } as never,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to log event for message ${messageId}: ${(e as Error).message}`);
    }

    // Create notification for the assigned agent (or skip if unassigned)
    if (lead.assigneeId) {
      try {
        await this.prisma.notification.create({
          data: {
            tenantId: lead.tenantId,
            userId: lead.assigneeId,
            type: "provider_error",
            title: "Mensaje no enviado",
            message: `No se pudo enviar el mensaje a ${lead.name ?? "lead"}: ${error}`,
            entity: "lead",
            entityId: lead.id,
          },
        });
      } catch (e) {
        this.logger.error(`Failed to create notification for message ${messageId}: ${(e as Error).message}`);
      }
    }
  }
}
