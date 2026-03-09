import { Controller, Post, Get, Body, Query, Req, Logger, ForbiddenException } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { LeadSourcesService } from "../lead-sources/lead-sources.service";
import { EventType } from "@inmoflow/db";

/**
 * Meta Lead Ads Webhook — single endpoint for all tenants.
 *
 * Flow:
 * 1. Meta sends a lead to POST /webhooks/meta
 * 2. We extract pageId from the payload
 * 3. We lookup LeadSource by pageId+formId to find the tenantId
 * 4. We create a Lead + EventLog in that tenant
 *
 * Verification:
 * Meta sends GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * We must respond with the challenge value.
 */
@Controller("webhooks/meta")
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);
  private readonly verifyToken: string;
  private readonly appSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
    private readonly leadSources: LeadSourcesService,
  ) {
    this.verifyToken = process.env.META_VERIFY_TOKEN ?? "";
    this.appSecret = process.env.META_APP_SECRET;
  }

  /** Verify Meta X-Hub-Signature-256 HMAC */
  private verifySignature(req: Request): boolean {
    if (!this.appSecret) {
      if (process.env.NODE_ENV === "production") return false;
      return true; // skip signature check in development only
    }
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!signature) return false;
    const body = JSON.stringify(req.body);
    const expected = "sha256=" + crypto.createHmac("sha256", this.appSecret).update(body).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * GET /webhooks/meta — Meta verification handshake.
   */
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    if (mode === "subscribe" && token === this.verifyToken) {
      this.logger.log("Meta webhook verified");
      return challenge;
    }
    this.logger.warn("Meta verification failed");
    return "Verification failed";
  }

  /**
   * POST /webhooks/meta — Receive lead ads.
   *
   * Payload structure (Facebook Lead Ads):
   * {
   *   "object": "page",
   *   "entry": [{
   *     "id": "<PAGE_ID>",
   *     "time": 1234567890,
   *     "changes": [{
   *       "field": "leadgen",
   *       "value": {
   *         "form_id": "<FORM_ID>",
   *         "leadgen_id": "<LEAD_ID>",
   *         "page_id": "<PAGE_ID>",
   *         "created_time": 1234567890
   *       }
   *     }]
   *   }]
   * }
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 300 } }) // 300 req/min — Meta can send bursts
  async receive(@Req() req: Request, @Body() body: MetaWebhookPayload) {
    // Verify HMAC signature
    if (!this.verifySignature(req)) {
      this.logger.warn("Meta webhook signature verification failed");
      throw new ForbiddenException("Invalid signature");
    }

    this.logger.debug(`Meta webhook: ${JSON.stringify(body).slice(0, 200)}`);

    if (body.object !== "page" || !body.entry?.length) {
      return { received: true, processed: 0 };
    }

    let processed = 0;

    for (const entry of body.entry) {
      const pageId = entry.id;

      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;

        const value = change.value;
        if (!value?.leadgen_id) continue;

        try {
          await this.processLeadAd(pageId, value);
          processed++;
        } catch (err) {
          this.logger.error(
            `Meta lead processing error: ${(err as Error).message}`,
          );
        }
      }
    }

    return { received: true, processed };
  }

  private async processLeadAd(
    pageId: string,
    value: MetaLeadgenValue,
  ) {
    const formId = value.form_id;
    const leadgenId = value.leadgen_id;

    // Find which tenant this belongs to
    const source = await this.leadSources.findByMetaMapping(pageId, formId);

    if (!source) {
      this.logger.warn(
        `No LeadSource mapping for pageId=${pageId} formId=${formId}`,
      );
      return;
    }

    const tenantId = source.tenantId;

    // Fetch lead data from Meta Graph API (prefer per-source token, fallback to env)
    const accessToken = source.metaPageAccessToken ?? process.env.META_PAGE_ACCESS_TOKEN;
    const leadData = await this.fetchLeadData(leadgenId, accessToken ?? undefined);

    // Extract fields from lead data
    const name = leadData?.full_name ?? leadData?.first_name
      ? `${leadData.first_name ?? ""} ${leadData.last_name ?? ""}`.trim()
      : undefined;
    const email = leadData?.email ?? undefined;
    const phone = leadData?.phone_number ?? undefined;

    // Auto-create lead
    const defaultStage = await this.prisma.leadStage.findFirst({
      where: { tenantId, isDefault: true },
    });

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: name || `Meta Lead ${leadgenId.slice(-6)}`,
        email,
        phone,
        sourceId: source.id,
        status: "NEW",
        stageId: defaultStage?.id,
        notes: `Origen: Meta Lead Ad\nForm: ${formId}\nLeadgen ID: ${leadgenId}`,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "Lead",
      entityId: lead.id,
      message: `Lead from Meta Lead Ad (page=${pageId}, form=${formId})`,
      payload: {
        leadgenId,
        pageId,
        formId,
        sourceId: source.id,
        leadData: leadData ?? undefined,
      },
    });

    await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
      sourceType: "META_LEAD_AD",
      leadgenId,
      pageId,
      formId,
    });

    this.logger.log(
      `Meta lead created: ${lead.id} for tenant ${tenantId.slice(0, 8)}`,
    );
  }

  /**
   * Fetch lead details from Meta Graph API.
   * Uses per-source Page Access Token from OAuth, falls back to env var.
   */
  private async fetchLeadData(
    leadgenId: string,
    accessToken?: string,
  ): Promise<MetaLeadData | null> {
    if (!accessToken) {
      this.logger.debug("No page access token — skipping Graph API fetch");
      return null;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${accessToken}`,
      );
      if (!res.ok) {
        this.logger.warn(`Graph API error: ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        field_data?: Array<{ name: string; values: string[] }>;
      };

      // Parse field_data into flat object
      const fields: Record<string, string> = {};
      for (const f of data.field_data ?? []) {
        fields[f.name] = f.values?.[0] ?? "";
      }

      return {
        full_name: fields["full_name"] ?? undefined,
        first_name: fields["first_name"] ?? undefined,
        last_name: fields["last_name"] ?? undefined,
        email: fields["email"] ?? undefined,
        phone_number: fields["phone_number"] ?? undefined,
      };
    } catch (err) {
      this.logger.warn(`Graph API fetch failed: ${(err as Error).message}`);
      return null;
    }
  }
}

// ─── Types ────────────────────────────────────────────

interface MetaWebhookPayload {
  object: string;
  entry?: MetaEntry[];
}

interface MetaEntry {
  id: string;
  time: number;
  changes?: MetaChange[];
}

interface MetaChange {
  field: string;
  value: MetaLeadgenValue;
}

interface MetaLeadgenValue {
  form_id: string;
  leadgen_id: string;
  page_id: string;
  created_time: number;
}

interface MetaLeadData {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}
