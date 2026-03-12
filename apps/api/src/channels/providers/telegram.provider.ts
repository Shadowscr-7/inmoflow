import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelStatus, EventType, Prisma } from "@inmoflow/db";
import { EventLogService } from "../../event-log/event-log.service";
import { EventProducerService } from "../../events/event-producer.service";

/**
 * Telegram Bot provider — single global bot for all tenants.
 * Each user claims their own chatId via /start <nonce> where nonce = base64(tenantId:userId).
 *
 * Uses Telegram Bot API long-polling (no webhook needed for MVP).
 */
@Injectable()
export class TelegramProvider implements OnModuleInit {
  private readonly logger = new Logger(TelegramProvider.name);
  private readonly botToken: string;
  private readonly apiBase: string;
  private pollingActive = false;
  private lastUpdateId = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
  ) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  onModuleInit() {
    if (!this.botToken) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram polling disabled");
      return;
    }
    this.startPolling();
  }

  /**
   * Generate a /start link that encodes both tenantId and userId, signed with HMAC.
   */
  generateStartLink(tenantId: string, userId: string): string {
    const data = Buffer.from(`${tenantId}:${userId}`).toString("base64url");
    const sig = crypto.createHmac("sha256", this.getSigningSecret()).update(data).digest("hex").slice(0, 16);
    const nonce = `${data}.${sig}`;
    return `https://t.me/${this.getBotUsername()}?start=${nonce}`;
  }

  /**
   * Send a message to a specific Telegram chatId.
   */
  async sendMessage(chatId: string, text: string) {
    const res = await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      this.logger.error(`Telegram sendMessage failed: ${err}`);
      throw new Error(`Telegram API error: ${res.status}`);
    }

    return res.json();
  }

  // ─── Internal ───────────────────────────────────────

  private getBotUsername(): string {
    return process.env.TELEGRAM_BOT_USERNAME ?? "InmoFlowBot";
  }

  private startPolling() {
    if (this.pollingActive) return;
    this.pollingActive = true;
    this.logger.log("Telegram long-polling started");
    this.poll();
  }

  private async poll() {
    while (this.pollingActive) {
      try {
        const res = await fetch(
          `${this.apiBase}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=30`,
          { signal: AbortSignal.timeout(35000) },
        );

        if (!res.ok) {
          this.logger.warn(`Telegram poll error: ${res.status}`);
          await this.sleep(5000);
          continue;
        }

        const data = (await res.json()) as {
          ok: boolean;
          result: TelegramUpdate[];
        };

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            this.lastUpdateId = update.update_id;
            await this.handleUpdate(update);
          }
        }
      } catch (err) {
        this.logger.warn(`Telegram poll exception: ${(err as Error).message}`);
        await this.sleep(5000);
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate) {
    const message = update.message;
    if (!message?.text) return;

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    // Handle /start command for per-user channel claiming
    if (text.startsWith("/start ")) {
      const nonce = text.slice(7).trim();
      await this.handleStartCommand(chatId, nonce, message);
      return;
    }

    // Handle regular inbound messages
    await this.handleInboundMessage(chatId, text, message);
  }

  private async handleStartCommand(
    chatId: string,
    nonce: string,
    message: TelegramMessage,
  ) {
    try {
      // Decode and verify HMAC-signed nonce → "data.signature"
      const dotIdx = nonce.indexOf(".");
      let decoded: string;
      if (dotIdx !== -1) {
        const data = nonce.slice(0, dotIdx);
        const sig = nonce.slice(dotIdx + 1);
        const expectedSig = crypto.createHmac("sha256", this.getSigningSecret()).update(data).digest("hex").slice(0, 16);
        if (sig !== expectedSig) {
          await this.sendMessage(chatId, "❌ Enlace inválido o expirado. Generá uno nuevo.");
          return;
        }
        decoded = Buffer.from(data, "base64url").toString("utf8");
      } else {
        // Legacy unsigned nonce — still decode but log warning
        decoded = Buffer.from(nonce, "base64url").toString("utf8");
        this.logger.warn("Received unsigned Telegram nonce (legacy)");
      }
      const colonIdx = decoded.indexOf(":");
      if (colonIdx === -1) {
        // Legacy link with only tenantId — reject gracefully
        await this.sendMessage(chatId, "❌ Enlace desactualizado. Generá uno nuevo desde la plataforma.");
        return;
      }

      const tenantId = decoded.slice(0, colonIdx);
      const userId = decoded.slice(colonIdx + 1);

      // Validate tenant + user exist
      const [tenant, user] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: tenantId } }),
        this.prisma.user.findFirst({ where: { id: userId, tenantId } }),
      ]);

      if (!tenant || !user) {
        await this.sendMessage(chatId, "❌ Enlace inválido. Contactá al administrador.");
        return;
      }

      // Find or update channel for this specific user
      let channel = await this.prisma.channel.findFirst({
        where: { tenantId, userId, type: "TELEGRAM" },
      });

      if (channel) {
        await this.prisma.channel.update({
          where: { id: channel.id },
          data: {
            status: ChannelStatus.CONNECTED,
            telegramChatId: chatId,
          },
        });
      } else {
        channel = await this.prisma.channel.create({
          data: {
            tenantId,
            userId,
            type: "TELEGRAM",
            status: ChannelStatus.CONNECTED,
            telegramChatId: chatId,
          },
        });
      }

      await this.eventLog.log({
        tenantId,
        type: EventType.channel_connected,
        entity: "Channel",
        entityId: channel.id,
        message: `Telegram connected for user ${user.name ?? user.email} (chatId: ${chatId})`,
      });

      const displayName = user.name ?? user.email;
      await this.sendMessage(
        chatId,
        `✅ ¡Canal conectado!\n<b>${displayName}</b> en <b>${tenant.name}</b>\nLos mensajes que recibas acá se registrarán en tu CRM.`,
      );
    } catch (err) {
      this.logger.error(`/start handler error: ${(err as Error).message}`);
      await this.sendMessage(chatId, "❌ Ocurrió un error. Intentá nuevamente.");
    }
  }

  private async handleInboundMessage(
    chatId: string,
    text: string,
    message: TelegramMessage,
  ) {
    try {
      // Find which channel (user) this chatId belongs to
      const channel = await this.prisma.channel.findFirst({
        where: {
          type: "TELEGRAM",
          telegramChatId: chatId,
          status: ChannelStatus.CONNECTED,
        },
      });

      if (!channel) {
        return;
      }

      const tenantId = channel.tenantId;
      const telegramUserId = String(message.from?.id ?? "");
      const contactName =
        [message.from?.first_name, message.from?.last_name]
          .filter(Boolean)
          .join(" ") || undefined;

      // Find or create lead by telegramUserId
      let lead = await this.prisma.lead.findFirst({
        where: { tenantId, telegramUserId },
      });

      if (!lead) {
        const defaultStage = await this.prisma.leadStage.findFirst({
          where: { tenantId, isDefault: true },
        });

        lead = await this.prisma.lead.create({
          data: {
            tenantId,
            name: contactName,
            telegramUserId,
            primaryChannel: "TELEGRAM",
            status: "NEW",
            stageId: defaultStage?.id,
            // Auto-assign to the user who owns this channel
            assigneeId: channel.userId,
          },
        });

        await this.eventLog.log({
          tenantId,
          type: EventType.lead_created,
          entity: "Lead",
          entityId: lead.id,
          message: `Lead auto-created from Telegram (assigned to channel owner)`,
          payload: { telegramUserId, chatId, assigneeId: channel.userId },
        });

        await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
          sourceType: "TELEGRAM",
          channel: "TELEGRAM",
        });

        // Lead was auto-assigned to the channel owner
        if (channel.userId) {
          await this.eventProducer.emitLeadAssigned(tenantId, lead.id, channel.userId);
        }
      }

      // Save the message
      const savedMsg = await this.prisma.message.create({
        data: {
          tenantId,
          leadId: lead.id,
          direction: "IN",
          channel: "TELEGRAM",
          from: telegramUserId,
          content: text,
          providerMessageId: String(message.message_id),
          rawPayload: message as unknown as Prisma.InputJsonValue,
        },
      });

      await this.eventLog.log({
        tenantId,
        type: EventType.message_inbound,
        entity: "Message",
        entityId: savedMsg.id,
        message: `Telegram message from ${contactName ?? telegramUserId}`,
      });

      await this.eventProducer.emitMessageInbound(tenantId, lead.id, savedMsg.id, "TELEGRAM", text);

      // Detect first inbound message from this lead → emit lead.contacted
      const inboundCount = await this.prisma.message.count({
        where: { tenantId, leadId: lead.id, direction: "IN" },
      });
      if (inboundCount === 1) {
        await this.eventProducer.emitLeadContacted(tenantId, lead.id, savedMsg.id, "TELEGRAM");
      }
    } catch (err) {
      this.logger.error(`Inbound TG message error: ${(err as Error).message}`);
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable is required");
    return secret;
  }
}

// ─── Telegram types (subset) ──────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}
