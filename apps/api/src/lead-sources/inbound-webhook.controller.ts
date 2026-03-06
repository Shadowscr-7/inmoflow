import {
  Controller,
  Post,
  Param,
  Body,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpCode,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { LeadStatus, EventType } from "@inmoflow/db";

/**
 * Generic Inbound Webhook — public endpoint for external systems.
 *
 * External systems POST lead data to:
 *   POST /webhooks/inbound/:apiKey
 *
 * The apiKey identifies the LeadSource (and therefore the tenant).
 * No JWT required — authentication is via the unique apiKey in the URL.
 *
 * Accepted body:
 * {
 *   "name":   "John Doe",           // optional
 *   "phone":  "+5491155554444",      // optional (at least one contact field recommended)
 *   "email":  "john@example.com",   // optional
 *   "intent": "Comprar depto 2amb", // optional
 *   "notes":  "Came from landing",  // optional
 *   "status": "NEW",                // optional, defaults to NEW
 *   "extra":  { ... }               // optional — stored in notes as JSON
 * }
 *
 * Also supports batch: POST an array of objects with the same shape.
 */
@Controller("webhooks/inbound")
export class InboundWebhookController {
  private readonly logger = new Logger(InboundWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
  ) {}

  @Post(":apiKey")
  @HttpCode(200)
  async receive(
    @Param("apiKey") apiKey: string,
    @Body() body: InboundLeadPayload | InboundLeadPayload[],
  ) {
    // Look up the source by apiKey
    const source = await this.prisma.leadSource.findFirst({
      where: { apiKey, enabled: true },
      select: {
        id: true,
        tenantId: true,
        enabled: true,
        name: true,
      },
    });

    if (!source) {
      throw new NotFoundException("Invalid webhook key");
    }

    // Support batch (array) or single object
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      throw new BadRequestException("Empty payload");
    }

    if (items.length > 100) {
      throw new BadRequestException("Maximum 100 leads per request");
    }

    const tenantId = source.tenantId;

    // Resolve default stage once
    const defaultStage = await this.prisma.leadStage.findFirst({
      where: { tenantId, isDefault: true },
    });

    let created = 0;
    const errors: { index: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        await this.processLead(tenantId, source.id, defaultStage?.id, items[i]);
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        this.logger.warn(`Webhook lead #${i} error: ${msg}`);
        errors.push({ index: i, message: msg });
      }
    }

    this.logger.log(
      `Webhook ${source.name} (${apiKey.slice(0, 8)}...): ${created} created, ${errors.length} errors`,
    );

    return {
      received: items.length,
      created,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async processLead(
    tenantId: string,
    sourceId: string,
    defaultStageId: string | undefined,
    data: InboundLeadPayload,
  ) {
    // Build notes: combine notes + extra fields
    let notes = data.notes ?? "";
    if (data.extra && typeof data.extra === "object" && Object.keys(data.extra).length > 0) {
      const extraStr = Object.entries(data.extra)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n");
      notes = notes ? `${notes}\n\n--- Datos extra ---\n${extraStr}` : `--- Datos extra ---\n${extraStr}`;
    }

    // Validate status if provided
    const validStatuses = Object.values(LeadStatus);
    const status = data.status && validStatuses.includes(data.status as LeadStatus)
      ? (data.status as LeadStatus)
      : LeadStatus.NEW;

    // Resolve stage by key if provided
    let stageId = defaultStageId;
    if (data.stageKey) {
      const stage = await this.prisma.leadStage.findUnique({
        where: { tenantId_key: { tenantId, key: data.stageKey } },
      });
      if (stage) stageId = stage.id;
    }

    // Resolve agent by name or email if provided
    let assigneeId: string | undefined;
    const agentValue = data.agent ?? (data.extra?.agente as string) ?? (data.extra?.agent as string);
    if (agentValue) {
      // Try exact match first (name or email), then partial match (contains)
      let user = await this.prisma.user.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { equals: agentValue, mode: "insensitive" } },
            { email: { equals: agentValue, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true },
      });

      // Fallback: partial name match (e.g. "Javier" matches "Javier Rodriguez")
      if (!user) {
        user = await this.prisma.user.findFirst({
          where: {
            tenantId,
            isActive: true,
            OR: [
              { name: { contains: agentValue, mode: "insensitive" } },
              { name: { startsWith: agentValue, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true },
        });
      }

      if (user) {
        assigneeId = user.id;
        this.logger.log(`Webhook agent "${agentValue}" resolved to user ${user.name} (${user.id.slice(0, 8)})`);
      } else {
        this.logger.warn(`Webhook agent "${agentValue}" not found in tenant ${tenantId.slice(0, 8)}`);
      }
    }

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: data.name || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        intent: data.intent || undefined,
        notes: notes || undefined,
        status,
        stageId,
        sourceId,
        assigneeId,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "Lead",
      entityId: lead.id,
      message: `Lead from webhook: ${data.name ?? data.phone ?? data.email ?? "unknown"}${assigneeId ? ` → agent ${agentValue}` : ""}`,
      payload: { sourceId, status, agent: agentValue, assigneeId },
    });

    // Enqueue for async rule processing (same as any other lead)
    await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
      sourceType: "WEBHOOK",
      status,
      agent: agentValue,
      assigneeId,
    });
  }
}

interface InboundLeadPayload {
  name?: string;
  phone?: string;
  email?: string;
  intent?: string;
  notes?: string;
  status?: string;
  stageKey?: string;
  agent?: string;
  extra?: Record<string, unknown>;
}
