import { Controller, Post, Get, Param, Body, Req, UseGuards, Logger, ForbiddenException, BadGatewayException, InternalServerErrorException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { ChannelsService } from "../channels/channels.service";
import { EvolutionProvider } from "../channels/providers/evolution.provider";
import { TelegramProvider } from "../channels/providers/telegram.provider";
import { JwtAuthGuard, TenantGuard } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { ChannelStatus, EventType, Prisma } from "@inmoflow/db";

/**
 * Webhooks controller — handles inbound messages from providers.
 * /webhooks/* routes are public (no JWT) — they receive callbacks from Evolution/Telegram.
 * /channels/whatsapp/* and /channels/telegram/* routes are authenticated and per-user.
 */
@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
    private readonly channelsService: ChannelsService,
    private readonly evolution: EvolutionProvider,
    private readonly telegram: TelegramProvider,
  ) {}

  // ═══════════════════════════════════════════════════
  // WhatsApp — Authenticated per-user endpoints
  // ═══════════════════════════════════════════════════

  /**
   * POST /channels/whatsapp/connect
   * Creates an Evolution instance for the current user and returns QR code.
   */
  @Post("channels/whatsapp/connect")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async connectWhatsApp(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const userId = user.userId;

    // Upsert channel for this user
    let channel = await this.channelsService.findByUserAndType(tenantId, userId, "WHATSAPP");
    if (!channel) {
      channel = await this.channelsService.create(tenantId, userId, { type: "WHATSAPP" });
    }

    // Unique instance per user
    const instanceName = `inmoflow_${tenantId.slice(0, 8)}_${userId.slice(0, 8)}`;
    // In production, use WEBHOOK_BASE_URL or derive from PLATFORM_DOMAIN so Evolution API can reach us.
    // In development (localhost), the webhook won't work — the sync mechanism is the fallback.
    const webhookBaseUrl =
      process.env.WEBHOOK_BASE_URL ??
      (process.env.PLATFORM_DOMAIN && process.env.NODE_ENV === "production"
        ? `https://${process.env.PLATFORM_DOMAIN}`
        : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
    const webhookUrl = `${webhookBaseUrl}/api/webhooks/whatsapp`;

    try {
      // Check Evolution API health first
      const healthy = await this.evolution.healthCheck();
      if (!healthy) {
        this.logger.error("Evolution API is not reachable");
        await this.channelsService.updateStatus(
          tenantId,
          channel.id,
          ChannelStatus.ERROR,
          { lastError: "Evolution API no disponible" },
        );
        throw new BadGatewayException("No se pudo conectar con Evolution API. Verificá que el servicio esté activo.");
      }

      // Create or reuse instance (idempotent)
      const instanceResult = await this.evolution.createInstance(instanceName, webhookUrl);

      if (instanceResult.error) {
        this.logger.error(`Evolution createInstance failed: ${instanceResult.error}`);
        await this.channelsService.updateStatus(
          tenantId,
          channel.id,
          ChannelStatus.ERROR,
          { lastError: instanceResult.error },
        );
        throw new BadGatewayException(`Error de Evolution API: ${instanceResult.error}`);
      }

      // Update channel with instance ID
      await this.channelsService.updateStatus(
        tenantId,
        channel.id,
        ChannelStatus.CONNECTING,
        { providerInstanceId: instanceName },
      );

      // Wait a moment for instance to initialize before requesting QR
      await new Promise((r) => setTimeout(r, 1500));

      // Get QR code
      const qr = await this.evolution.getQrCode(instanceName);

      return {
        channelId: channel.id,
        status: "CONNECTING",
        instanceName,
        qrCode: qr?.base64 ?? null,
        pairingCode: qr?.pairingCode ?? null,
      };
    } catch (err) {
      // Re-throw NestJS HttpExceptions as-is
      if (err instanceof BadGatewayException || err instanceof InternalServerErrorException) {
        throw err;
      }

      const errorMsg = (err as Error).message ?? "Error desconocido";
      this.logger.error(`connectWhatsApp error: ${errorMsg}`);
      await this.channelsService.updateStatus(
        tenantId,
        channel.id,
        ChannelStatus.ERROR,
        { lastError: errorMsg },
      );
      throw new BadGatewayException(`Error al conectar WhatsApp: ${errorMsg}`);
    }
  }

  /**
   * POST /channels/whatsapp/reregister-webhook
   * Re-registers the webhook URL on the existing Evolution instance without disconnecting.
   * Use this when the API's public URL changed after the instance was first created.
   */
  @Post("channels/whatsapp/reregister-webhook")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async reregisterWebhook(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const channel = await this.channelsService.findByUserAndType(tenantId, user.userId, "WHATSAPP");
    if (!channel?.providerInstanceId) {
      return { success: false, message: "No hay instancia de WhatsApp configurada" };
    }

    const webhookBaseUrl =
      process.env.WEBHOOK_BASE_URL ??
      (process.env.PLATFORM_DOMAIN && process.env.NODE_ENV === "production"
        ? `https://${process.env.PLATFORM_DOMAIN}`
        : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
    const webhookUrl = `${webhookBaseUrl}/api/webhooks/whatsapp`;

    const ok = await this.evolution.updateWebhook(channel.providerInstanceId, webhookUrl);
    return {
      success: ok,
      webhookUrl,
      message: ok
        ? `Webhook actualizado correctamente → ${webhookUrl}`
        : "No se pudo actualizar el webhook en Evolution API",
    };
  }

  /**
   * GET /channels/whatsapp/qr
   * Refresh QR code for the current user's WA instance.
   */
  @Get("channels/whatsapp/qr")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getWhatsAppQr(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const channel = await this.channelsService.findByUserAndType(tenantId, user.userId, "WHATSAPP");
    if (!channel?.providerInstanceId) {
      return { qrCode: null, status: channel?.status ?? "NOT_FOUND" };
    }

    // Check connection state first
    try {
      const state = await this.evolution.getConnectionState(channel.providerInstanceId);
      if (state.state === "open") {
        if (channel.status !== ChannelStatus.CONNECTED) {
          await this.channelsService.updateStatus(
            tenantId,
            channel.id,
            ChannelStatus.CONNECTED,
          );
        }
        return { qrCode: null, status: "CONNECTED" };
      }
    } catch {
      // Ignore — try to get QR anyway
    }

    const qr = await this.evolution.getQrCode(channel.providerInstanceId);
    return {
      qrCode: qr?.base64 ?? null,
      pairingCode: qr?.pairingCode ?? null,
      status: channel.status,
    };
  }

  /**
   * POST /channels/whatsapp/disconnect
   * Disconnect the current user's WA instance.
   */
  @Post("channels/whatsapp/disconnect")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async disconnectWhatsApp(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const channel = await this.channelsService.findByUserAndType(tenantId, user.userId, "WHATSAPP");
    if (!channel) return { ok: true };

    if (channel.providerInstanceId) {
      try {
        await this.evolution.logoutInstance(channel.providerInstanceId);
      } catch {
        // Already disconnected
      }
    }

    await this.channelsService.updateStatus(
      tenantId,
      channel.id,
      ChannelStatus.DISCONNECTED,
    );

    return { ok: true, status: "DISCONNECTED" };
  }

  /**
   * POST /channels/whatsapp/reset
   * Fully resets the user's WA channel — deletes the Evolution instance and removes
   * the channel record so they can start the pairing flow from scratch.
   * Use this when the CONNECTING state is stuck or the QR was never scanned.
   */
  @Post("channels/whatsapp/reset")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async resetWhatsApp(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const channel = await this.channelsService.findByUserAndType(tenantId, user.userId, "WHATSAPP");
    if (!channel) return { ok: true };

    // Delete the Evolution instance entirely so there's no stale state
    if (channel.providerInstanceId) {
      try {
        await this.evolution.deleteInstance(channel.providerInstanceId);
      } catch {
        // Ignore — instance may already be gone
      }
    }

    // Delete the channel record so the user can start fresh
    await this.channelsService.delete(tenantId, channel.id);

    this.logger.log(`WhatsApp channel reset for user ${user.userId} (tenant ${tenantId})`);
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════
  // Telegram — Authenticated per-user endpoints
  // ═══════════════════════════════════════════════════

  /**
   * POST /channels/telegram/connect
   * Creates a Telegram channel for the current user and returns the start link.
   */
  @Post("channels/telegram/connect")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async connectTelegram(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const userId = user.userId;

    let channel = await this.channelsService.findByUserAndType(tenantId, userId, "TELEGRAM");
    if (!channel) {
      channel = await this.channelsService.create(tenantId, userId, { type: "TELEGRAM" });
    }

    // Encode both tenantId and userId in the nonce
    const startLink = this.telegram.generateStartLink(tenantId, userId);

    return {
      channelId: channel.id,
      status: channel.status,
      startLink,
    };
  }

  /**
   * GET /channels/telegram/status
   * Check if the current user's Telegram channel is connected.
   */
  @Get("channels/telegram/status")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getTelegramStatus(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const channel = await this.channelsService.findByUserAndType(tenantId, user.userId, "TELEGRAM");
    return {
      connected: channel?.status === ChannelStatus.CONNECTED,
      status: channel?.status ?? "NOT_FOUND",
      chatId: channel?.telegramChatId ?? null,
    };
  }

  // ═══════════════════════════════════════════════════
  // Webhooks — Public (no auth)
  // ═══════════════════════════════════════════════════

  /**
   * POST /webhooks/whatsapp
   * Receives Evolution API webhook events.
   */
  @Post("webhooks/whatsapp")
  @Throttle({ default: { ttl: 60000, limit: 300 } }) // 300 req/min — provider can burst
  async whatsappWebhook(@Req() req: Request, @Body() body: EvolutionWebhookPayload) {
    // Verify HMAC if EVOLUTION_WEBHOOK_SECRET is configured
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers["x-webhook-signature"] as string | undefined;
      if (!signature) {
        this.logger.warn("WA webhook missing signature header");
        throw new ForbiddenException("Missing signature");
      }
      const expected = crypto.createHmac("sha256", webhookSecret).update(JSON.stringify(body)).digest("hex");
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        this.logger.warn("WA webhook signature mismatch");
        throw new ForbiddenException("Invalid signature");
      }
    } else if (process.env.NODE_ENV === "production") {
      this.logger.warn("EVOLUTION_WEBHOOK_SECRET not set — accepting unsigned webhook (configure secret for security)");
    }

    this.logger.debug(`WA webhook: ${body.event} instance=${body.instance}`);

    try {
      if (body.event === "connection.update") {
        await this.handleConnectionUpdate(body);
      } else if (body.event === "messages.upsert") {
        await this.handleMessageUpsert(body);
      } else {
        this.logger.debug(`WA webhook: unhandled event type "${body.event}"`);
      }
    } catch (err) {
      this.logger.error(`WA webhook error: ${(err as Error).message}`);
    }

    return { received: true };
  }

  // ─── WhatsApp webhook handlers ──────────────────────

  private async handleConnectionUpdate(payload: EvolutionWebhookPayload) {
    const instanceName = payload.instance;
    const state = payload.data?.state ?? payload.data?.status;

    // Find channel by providerInstanceId
    const channel = await this.prisma.channel.findFirst({
      where: { providerInstanceId: instanceName },
    });
    if (!channel) {
      this.logger.warn(`No channel found for instance ${instanceName}`);
      return;
    }

    let newStatus: ChannelStatus = ChannelStatus.CONNECTING;
    if (state === "open" || state === "connected") {
      newStatus = ChannelStatus.CONNECTED;
    } else if (state === "close" || state === "disconnected") {
      newStatus = ChannelStatus.DISCONNECTED;
    }

    await this.channelsService.updateStatus(
      channel.tenantId,
      channel.id,
      newStatus,
    );

    this.logger.log(`WA instance ${instanceName} → ${newStatus}`);
  }

  private async handleMessageUpsert(payload: EvolutionWebhookPayload) {
    const instanceName = payload.instance;
    const msgData = payload.data;
    if (!msgData) return;

    const isFromMe = msgData.key?.fromMe === true;

    // Skip group messages
    const remoteJid = msgData.key?.remoteJid ?? "";
    if (remoteJid.endsWith("@g.us")) return;

    // Find channel
    const channel = await this.prisma.channel.findFirst({
      where: { providerInstanceId: instanceName },
    });
    if (!channel) {
      this.logger.warn(`WA inbound: no channel found for instance "${instanceName}"`);
      return;
    }

    const tenantId = channel.tenantId;
    // Extract phone from JID (e.g., "5491112345678@s.whatsapp.net" → "5491112345678")
    const phone = remoteJid.replace(/@.*/, "");
    const phoneWithPlus = phone.startsWith("+") ? phone : `+${phone}`;
    const phoneWithoutPlus = phone.replace(/^\+/, "");
    const content =
      msgData.message?.conversation ??
      msgData.message?.extendedTextMessage?.text ??
      "[media]";
    const pushName = msgData.pushName ?? undefined;

    // Handle outgoing messages (sent from WhatsApp app directly, not via CRM)
    if (isFromMe) {
      const providerMessageId = msgData.key?.id;
      // If already stored by the CRM when it sent the message, skip to avoid duplicates
      if (providerMessageId) {
        const existing = await this.prisma.message.findFirst({
          where: { tenantId, providerMessageId },
          select: { id: true },
        });
        if (existing) return;
      }

      // Find the lead by phone (remoteJid is the contact, not the sender)
      const lead = await this.prisma.lead.findFirst({
        where: {
          tenantId,
          OR: [
            { phone: phoneWithoutPlus },
            { phone: phoneWithPlus },
            { whatsappFrom: phoneWithoutPlus },
            { whatsappFrom: phoneWithPlus },
          ],
        },
      });
      if (!lead) return; // Don't auto-create leads from outgoing messages

      await this.prisma.message.create({
        data: {
          tenantId,
          leadId: lead.id,
          direction: "OUT",
          channel: "WHATSAPP",
          to: phoneWithPlus,
          content,
          providerMessageId,
          status: "sent",
          rawPayload: msgData as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`WA msg OUT (from phone): → ${phoneWithPlus} lead ${lead.id.slice(0, 8)}`);
      return;
    }

    // Find or create lead by phone — try both formats (with and without "+")
    let lead = await this.prisma.lead.findFirst({
      where: {
        tenantId,
        OR: [
          { phone: phoneWithoutPlus },
          { phone: phoneWithPlus },
          { whatsappFrom: phoneWithoutPlus },
          { whatsappFrom: phoneWithPlus },
        ],
      },
    });

    // ── AI Demo Mode: check if this phone matches a lead's demo test number ──
    let isDemoInbound = false;
    if (!lead || !lead.aiConversationActive) {
      const demoLead = await this.prisma.lead.findFirst({
        where: {
          tenantId,
          aiConversationActive: true,
          aiDemoMode: true,
          OR: [
            { aiDemoPhone: phoneWithoutPlus },
            { aiDemoPhone: phoneWithPlus },
          ],
        },
      });
      if (demoLead) {
        lead = demoLead;
        isDemoInbound = true;
        this.logger.log(`AI DEMO: inbound from test phone ${phone} → routed to lead ${lead.id}`);
      }
    }

    if (!lead) {
      // Only auto-create leads if tenant has an active WHATSAPP_INBOUND source.
      // If not, this is just a conversation from an existing contact — log and skip lead creation.
      const whatsappSource = await this.prisma.leadSource.findFirst({
        where: { tenantId, type: "WHATSAPP_INBOUND", enabled: true },
      });

      if (!whatsappSource) {
        this.logger.debug(
          `WA inbound: no active WHATSAPP_INBOUND source for tenant ${tenantId.slice(0, 8)} — skipping auto-lead creation for ${phone}`,
        );
        return;
      }

      // Auto-create lead and assign to channel owner
      const defaultStage = await this.prisma.leadStage.findFirst({
        where: { tenantId, isDefault: true },
      });

      lead = await this.prisma.lead.create({
        data: {
          tenantId,
          name: pushName,
          phone: phoneWithPlus,
          whatsappFrom: phoneWithoutPlus,
          primaryChannel: "WHATSAPP",
          status: "NEW",
          stageId: defaultStage?.id,
          assigneeId: channel.userId,
          sourceId: whatsappSource.id,
        },
      });

      await this.eventLog.log({
        tenantId,
        type: EventType.lead_created,
        entity: "Lead",
        entityId: lead.id,
        message: `Lead auto-created from WhatsApp (${phone}), assigned to channel owner`,
        payload: { phone, pushName, assigneeId: channel.userId },
      });

      await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
        sourceType: "WHATSAPP",
        channel: "WHATSAPP",
      });

      // Lead was auto-assigned to the channel owner
      if (channel.userId) {
        await this.eventProducer.emitLeadAssigned(tenantId, lead.id, channel.userId);
      }
    } else if (!lead.whatsappFrom) {
      // Existing lead found but missing whatsappFrom — populate it for future outbound messages
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { whatsappFrom: phoneWithoutPlus },
      });
      lead = { ...lead, whatsappFrom: phoneWithoutPlus };
    }

    // Save message
    const message = await this.prisma.message.create({
      data: {
        tenantId,
        leadId: lead.id,
        direction: "IN",
        channel: "WHATSAPP",
        from: phoneWithPlus,
        content,
        providerMessageId: msgData.key?.id,
        rawPayload: {
          ...(msgData as Record<string, unknown>),
          ...(isDemoInbound && { aiDemoInbound: true, demoPhone: phoneWithoutPlus }),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.message_inbound,
      entity: "Message",
      entityId: message.id,
      message: `WhatsApp IN from ${pushName ?? phone}`,
      payload: { leadId: lead.id, phone },
    });

    await this.eventProducer.emitMessageInbound(tenantId, lead.id, message.id, "WHATSAPP", content);

    // Detect first inbound message from this lead → emit lead.contacted
    const inboundCount = await this.prisma.message.count({
      where: { tenantId, leadId: lead.id, direction: "IN" },
    });
    if (inboundCount === 1) {
      await this.eventProducer.emitLeadContacted(tenantId, lead.id, message.id, "WHATSAPP");
    }

    this.logger.log(`WA msg IN: ${phoneWithPlus} → lead ${lead.id.slice(0, 8)} (tenant ${tenantId.slice(0, 8)})`);
  }
}

// ─── Evolution webhook types ──────────────────────────

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data?: {
    state?: string;
    status?: string;
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
    [key: string]: unknown;
  };
}
