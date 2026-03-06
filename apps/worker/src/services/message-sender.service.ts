import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ChannelStatus, MessageChannel } from "@inmoflow/db";

/**
 * MessageSenderService — sends queued messages through the correct provider.
 *
 * Determines which channel to use based on the lead's assigned agent,
 * falling back to any connected tenant channel.
 *
 * Providers supported: WhatsApp (Evolution API), Telegram.
 */
@Injectable()
export class MessageSenderService {
  private readonly logger = new Logger(MessageSenderService.name);

  // Evolution API settings
  private readonly evoBaseUrl: string;
  private readonly evoApiKey: string;

  // Telegram settings
  private readonly tgBotToken: string;

  constructor(private readonly prisma: PrismaService) {
    const raw = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
    this.evoBaseUrl = raw.replace(/\/+$/, "");
    this.evoApiKey = process.env.EVOLUTION_API_KEY ?? "";
    this.tgBotToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  }

  /**
   * Send a single queued message by ID.
   * Returns true if sent successfully, false otherwise.
   */
  async sendQueuedMessage(messageId: string): Promise<boolean> {
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
        return await this.sendWhatsApp(message.id, message.tenantId, lead, message.content);
      } else if (message.channel === MessageChannel.TELEGRAM) {
        return await this.sendTelegram(message.id, message.tenantId, lead, message.content);
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
    lead: { assigneeId: string | null; whatsappFrom: string | null; phone: string | null },
    content: string,
  ): Promise<boolean> {
    const phone = lead.whatsappFrom ?? lead.phone;
    if (!phone) {
      await this.markFailed(messageId, "Lead has no WhatsApp number");
      return false;
    }

    // Find channel — prefer assigned agent's channel, fallback to any
    let channel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "WHATSAPP", status: ChannelStatus.CONNECTED },
        })
      : null;
    if (!channel) {
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

    // Call Evolution API sendText
    const url = `${this.evoBaseUrl}/message/sendText/${channel.providerInstanceId}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.evoApiKey,
      },
      body: JSON.stringify({
        number: to,
        text: content,
      }),
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
  ): Promise<boolean> {
    if (!this.tgBotToken) {
      await this.markFailed(messageId, "Telegram bot token not configured");
      return false;
    }

    // Find channel — prefer assigned agent's channel, fallback to any
    let channel = lead.assigneeId
      ? await this.prisma.channel.findFirst({
          where: { tenantId, userId: lead.assigneeId, type: "TELEGRAM", status: ChannelStatus.CONNECTED },
        })
      : null;
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
    await this.prisma.message.update({
      where: { id: messageId },
      data: { status: "failed", error },
    });
  }
}
