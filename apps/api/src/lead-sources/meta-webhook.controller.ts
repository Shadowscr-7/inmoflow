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
    const rawBody: Buffer | undefined = (req as any).rawBody;
    const bodyToSign = rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expected = "sha256=" + crypto.createHmac("sha256", this.appSecret).update(bodyToSign).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
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

    // Fetch form name + questions from Graph API
    let formName: string | null = source.metaFormName ?? null;
    let formQuestions: FormQuestion[] = [];
    if (accessToken) {
      const formDetails = await this.fetchFormDetails(formId, accessToken);
      if (!formName && formDetails.name) formName = formDetails.name;
      formQuestions = formDetails.questions;
    }

    // Detect "Te interesa que un agente se ponga en contacto por..." question
    // Find by matching field key in customFields against question keys, or by key pattern
    const teInteresaKey = this.findTeInteresaKey(leadData?.customFields ?? {}, formQuestions);
    const teInteresaAnswer = teInteresaKey ? (leadData?.customFields ?? {})[teInteresaKey] : null;
    const isInterested = !teInteresaAnswer || !/^(no|0)$/i.test(teInteresaAnswer.trim());

    // Extract property title from question label: "...contacto por [PROPERTY] de U$S [PRICE]?"
    let propertyTitle: string | null = null;
    if (teInteresaKey) {
      const question = formQuestions.find((q) => q.key === teInteresaKey);
      if (question?.label) {
        const match = question.label.match(/(?:por\s+)(.+?)(?:\s+de\s+[Uu]\$?[Ss]?|\?|$)/i);
        if (match) propertyTitle = match[1].trim();
      }
    }

    // Extract fields from lead data
    const name = leadData?.full_name
      ?? (leadData?.first_name ? `${leadData.first_name} ${leadData.last_name ?? ""}`.trim() : undefined);
    const email = leadData?.email ?? undefined;
    const phone = leadData?.phone_number ?? undefined;

    // Extract agent name from form name: "Casa en venta - Javier" → "Javier" / "Captacion Javier" → "Javier"
    const agentFromForm = this.extractAgentFromFormName(formName ?? "");

    // Auto-create lead
    const defaultStage = await this.prisma.leadStage.findFirst({
      where: { tenantId, isDefault: true },
    });

    // Build notes
    const customLines = Object.entries(leadData?.customFields ?? {})
      .filter(([k]) => k !== teInteresaKey) // exclude te_interesa (stored separately below)
      .map(([k, v]) => {
        const label = formQuestions.find((q) => q.key === k)?.label ?? k.replace(/_/g, " ");
        return `• ${label}: ${v}`;
      });

    if (teInteresaKey && teInteresaAnswer) {
      customLines.unshift(`• Te interesa contacto: ${teInteresaAnswer}`);
    }
    if (propertyTitle) {
      customLines.unshift(`• Propiedad: ${propertyTitle}`);
    }

    const noteLines = [
      "Origen: Meta Lead Ad",
      formName ? `Formulario: ${formName}` : `Form ID: ${formId}`,
      `Leadgen ID: ${leadgenId}`,
      ...(agentFromForm ? [`Agente formulario: ${agentFromForm}`] : []),
      ...(customLines.length > 0 ? ["", "Respuestas del formulario:", ...customLines] : []),
    ];

    // If not interested → create as LOST, no notifications
    const leadStatus = isInterested ? "NEW" : "LOST";

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: name || `Meta Lead ${leadgenId.slice(-6)}`,
        email,
        phone,
        sourceId: source.id,
        status: leadStatus,
        stageId: defaultStage?.id,
        notes: noteLines.join("\n"),
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "Lead",
      entityId: lead.id,
      message: `Lead from Meta Lead Ad (page=${pageId}, form=${formId}, interested=${isInterested})`,
      payload: {
        leadgenId,
        pageId,
        formId,
        sourceId: source.id,
        isInterested,
        propertyTitle,
        agentFromForm,
        leadData: leadData ?? undefined,
      },
    });

    // Only emit lead.created event (triggers notifications) if interested
    if (isInterested) {
      await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
        sourceType: "META_LEAD_AD",
        leadgenId,
        pageId,
        formId,
        formName: formName ?? undefined,
      });
    }

    this.logger.log(
      `Meta lead ${isInterested ? "created" : "created (LOST — not interested)"}: ${lead.id} for tenant ${tenantId.slice(0, 8)}`,
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

      // Separate standard fields from custom question answers
      const STANDARD_FIELDS = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"]);
      const customFields: Record<string, string> = {};
      for (const [key, val] of Object.entries(fields)) {
        if (!STANDARD_FIELDS.has(key) && val) customFields[key] = val;
      }

      return {
        full_name: fields["full_name"] ?? undefined,
        first_name: fields["first_name"] ?? undefined,
        last_name: fields["last_name"] ?? undefined,
        email: fields["email"] ?? undefined,
        phone_number: fields["phone_number"] ?? undefined,
        customFields,
      };
    } catch (err) {
      this.logger.warn(`Graph API fetch failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Fetch form name + questions from Meta Graph API */
  private async fetchFormDetails(formId: string, accessToken: string): Promise<{ name: string | null; questions: FormQuestion[] }> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${formId}?fields=name,questions&access_token=${accessToken}`,
      );
      if (!res.ok) return { name: null, questions: [] };
      const data = await res.json() as { name?: string; questions?: FormQuestion[] };
      return {
        name: data.name ?? null,
        questions: data.questions ?? [],
      };
    } catch {
      return { name: null, questions: [] };
    }
  }

  /**
   * Find the field key corresponding to "Te interesa que un agente..." question.
   * Matches by checking question labels or common key patterns.
   */
  private findTeInteresaKey(customFields: Record<string, string>, questions: FormQuestion[]): string | null {
    // Match by question label
    for (const q of questions) {
      if (/te\s+interesa/i.test(q.label ?? "") || /contacto\s+por/i.test(q.label ?? "")) {
        if (q.key in customFields) return q.key;
      }
    }
    // Fallback: match by key pattern
    for (const key of Object.keys(customFields)) {
      if (/te.interesa/i.test(key) || /interesa.agente/i.test(key) || /contacto.por/i.test(key)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Extract agent name from form name.
   * "Casa en venta - Javier" → "Javier"
   * "Captacion Javier" → "Javier"
   * "Locales comerciales - Nacho" → "Nacho"
   */
  private extractAgentFromFormName(formName: string): string | null {
    if (!formName) return null;
    // Pattern 1: "Something - AgentName"
    const dashMatch = formName.match(/[-–]\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*$/u);
    if (dashMatch) return dashMatch[1].trim();
    // Pattern 2: "Captacion(es)? AgentName" (last capitalized word)
    const captacMatch = formName.match(/[Cc]aptaci[oó]n\w*\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*$/u);
    if (captacMatch) return captacMatch[1].trim();
    return null;
  }
}

// ─── Types ────────────────────────────────────────────

interface FormQuestion {
  key: string;
  label?: string;
  type?: string;
}

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
  customFields?: Record<string, string>;
}
