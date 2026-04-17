import { Injectable, Logger, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventProducerService } from "../events/event-producer.service";
import { LeadSourcesService } from "../lead-sources/lead-sources.service";
import { EventType } from "@inmoflow/db";

interface MetaLeadField {
  name: string;
  values: string[];
}

interface MetaLeadRecord {
  id: string;
  created_time: string;
  field_data?: MetaLeadField[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
}

interface MetaLeadsResponse {
  data?: MetaLeadRecord[];
  paging?: { cursors?: { after?: string }; next?: string };
}

@Injectable()
export class LeadRecoveryService {
  private readonly logger = new Logger(LeadRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly eventProducer: EventProducerService,
    private readonly leadSources: LeadSourcesService,
  ) {}

  /**
   * Fetch leads from Meta for all connected Meta sources in the tenant,
   * within the given date range. Returns pending/approved/rejected items.
   */
  async fetchFromMeta(
    tenantId: string,
    from: Date,
    to: Date,
  ) {
    // Get all META_LEAD_AD sources for this tenant that have form+page config
    const sources = await this.prisma.leadSource.findMany({
      where: { tenantId, type: "META_LEAD_AD", enabled: true },
    });

    const metaSources = sources.filter(
      (s) => s.metaFormId && (s.metaPageAccessToken || process.env.META_PAGE_ACCESS_TOKEN),
    );

    if (metaSources.length === 0) {
      return { items: [], total: 0, sources: 0 };
    }

    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000);

    const allLeadgenIds: string[] = [];
    const rawByLeadgenId: Record<string, { record: MetaLeadRecord; sourceId: string; formName: string | null; pageId: string; formId: string }> = {};

    // Fetch from each form
    for (const source of metaSources) {
      const token = source.metaPageAccessToken ?? process.env.META_PAGE_ACCESS_TOKEN ?? "";
      const formId = source.metaFormId!;
      const pageId = source.metaPageId ?? "";

      const records = await this.fetchFormLeads(formId, token, fromTs, toTs);
      for (const rec of records) {
        allLeadgenIds.push(rec.id);
        rawByLeadgenId[rec.id] = {
          record: rec,
          sourceId: source.id,
          formName: source.metaFormName ?? null,
          pageId,
          formId,
        };
      }
    }

    if (allLeadgenIds.length === 0) {
      return { items: [], total: 0, sources: metaSources.length };
    }

    // Load existing approvals for these leadgen IDs
    const existingApprovals = await this.prisma.leadApproval.findMany({
      where: { tenantId, leadgenId: { in: allLeadgenIds } },
    });
    const approvalMap = new Map(existingApprovals.map((a) => [a.leadgenId, a]));

    // Load existing leads to check for duplicates (already imported via webhook)
    const existingLeads = await this.prisma.lead.findMany({
      where: { tenantId, sourceId: { in: metaSources.map((s) => s.id) } },
      select: { id: true, notes: true },
    });
    const importedLeadgenIds = new Set<string>();
    for (const lead of existingLeads) {
      const match = (lead.notes ?? "").match(/Leadgen ID:\s*(\d+)/);
      if (match) importedLeadgenIds.add(match[1]);
    }

    // Build response items
    const items = allLeadgenIds.map((leadgenId) => {
      const { record, sourceId, formName, pageId, formId } = rawByLeadgenId[leadgenId];
      const approval = approvalMap.get(leadgenId);

      // Parse field_data
      const fields: Record<string, string> = {};
      for (const f of record.field_data ?? []) {
        fields[f.name] = f.values?.[0] ?? "";
      }

      let status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING";
      if (approval) {
        status = approval.status as "PENDING" | "APPROVED" | "REJECTED";
      } else if (importedLeadgenIds.has(leadgenId)) {
        status = "APPROVED"; // already imported via real-time webhook
      }

      return {
        leadgenId,
        sourceId,
        formId,
        pageId,
        formName,
        status,
        approvalId: approval?.id ?? null,
        leadId: approval?.leadId ?? null,
        createdTime: record.created_time,
        // Parsed fields
        name: fields["full_name"] ?? ([fields["first_name"], fields["last_name"]].filter(Boolean).join(" ") || null),
        phone: fields["phone_number"] ?? fields["phone"] ?? null,
        email: fields["email"] ?? null,
        customFields: Object.fromEntries(
          Object.entries(fields).filter(([k]) =>
            !["full_name", "first_name", "last_name", "email", "phone_number", "phone"].includes(k)
          )
        ),
        adName: record.ad_name ?? null,
        campaignName: record.campaign_name ?? null,
      };
    });

    return { items, total: items.length, sources: metaSources.length };
  }

  /**
   * Approve a pending lead — creates it in the CRM if not already created.
   */
  async approve(tenantId: string, leadgenId: string, reviewedBy: string) {
    // Find or fetch the lead data
    const existing = await this.prisma.leadApproval.findUnique({
      where: { tenantId_leadgenId: { tenantId, leadgenId } },
    });

    // Check if already a real lead (imported via webhook)
    if (!existing) {
      // Create a PENDING approval first by fetching from Meta, then approve
      throw new NotFoundException(`No se encontró la entrada de recuperación para leadgenId=${leadgenId}. Recuperá los leads primero.`);
    }

    if (existing.status === "APPROVED") {
      return { ok: true, leadId: existing.leadId, message: "Ya estaba aprobado" };
    }

    if (existing.status === "REJECTED") {
      throw new ForbiddenException("Este lead ya fue rechazado. No se puede aprobar.");
    }

    const rawData = existing.rawData as Record<string, unknown>;
    const fields = rawData.fields as Record<string, string> ?? {};

    const name = fields["full_name"] ?? ([fields["first_name"], fields["last_name"]].filter(Boolean).join(" ") || `Meta Lead ${leadgenId.slice(-6)}`);
    const email = fields["email"] ?? undefined;
    const phone = fields["phone_number"] ?? fields["phone"] ?? undefined;

    const defaultStage = await this.prisma.leadStage.findFirst({
      where: { tenantId, isDefault: true },
    });

    const customFields = rawData.customFields as Record<string, string> ?? {};
    const noteLines = [
      "Origen: Meta Lead Ad",
      existing.formName ? `Formulario: ${existing.formName}` : `Form ID: ${existing.formId}`,
      `Leadgen ID: ${leadgenId}`,
      ...(Object.keys(customFields).length > 0 ? ["", "Respuestas del formulario:", ...Object.entries(customFields).map(([k, v]) => `• ${k}: ${v}`)] : []),
    ];

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name,
        email,
        phone,
        sourceId: existing.sourceId ?? undefined,
        status: "NEW",
        stageId: defaultStage?.id,
        notes: noteLines.join("\n"),
      },
    });

    await this.prisma.leadApproval.update({
      where: { id: existing.id },
      data: { status: "APPROVED", leadId: lead.id, reviewedBy, reviewedAt: new Date() },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "Lead",
      entityId: lead.id,
      message: `Lead created via recovery approval (leadgenId=${leadgenId})`,
      payload: { leadgenId, reviewedBy },
    });

    await this.eventProducer.emitLeadCreated(tenantId, lead.id, {
      sourceType: "META_LEAD_AD",
      leadgenId,
      formId: existing.formId,
      formName: existing.formName ?? undefined,
      recoveredAt: new Date().toISOString(),
    });

    return { ok: true, leadId: lead.id };
  }

  /**
   * Reject a pending lead — marks it as discarded historical record.
   */
  async reject(tenantId: string, leadgenId: string, reviewedBy: string) {
    const existing = await this.prisma.leadApproval.findUnique({
      where: { tenantId_leadgenId: { tenantId, leadgenId } },
    });

    if (!existing) {
      throw new NotFoundException(`No se encontró la entrada para leadgenId=${leadgenId}.`);
    }

    if (existing.status === "APPROVED") {
      throw new ForbiddenException("Este lead ya fue aprobado. No se puede rechazar.");
    }

    await this.prisma.leadApproval.update({
      where: { id: existing.id },
      data: { status: "REJECTED", reviewedBy, reviewedAt: new Date() },
    });

    return { ok: true };
  }

  /**
   * Upsert a LeadApproval record (called during fetch to persist raw data).
   */
  async upsertPending(
    tenantId: string,
    leadgenId: string,
    data: {
      sourceId: string | null;
      pageId: string;
      formId: string;
      formName: string | null;
      fields: Record<string, string>;
      customFields: Record<string, string>;
      rawRecord: unknown;
    },
  ) {
    await this.prisma.leadApproval.upsert({
      where: { tenantId_leadgenId: { tenantId, leadgenId } },
      create: {
        tenantId,
        leadgenId,
        sourceId: data.sourceId,
        pageId: data.pageId,
        formId: data.formId,
        formName: data.formName,
        status: "PENDING",
        rawData: { fields: data.fields, customFields: data.customFields, rawRecord: data.rawRecord } as any,
      },
      update: {
        // Don't overwrite status if already reviewed
        formName: data.formName ?? undefined,
        rawData: { fields: data.fields, customFields: data.customFields, rawRecord: data.rawRecord } as any,
      },
    });
  }

  // ─── Meta Graph API ──────────────────────────────────

  private async fetchFormLeads(
    formId: string,
    accessToken: string,
    fromTs: number,
    toTs: number,
    cursor?: string,
  ): Promise<MetaLeadRecord[]> {
    const results: MetaLeadRecord[] = [];
    let nextCursor = cursor;
    let page = 0;

    do {
      page++;
      if (page > 20) break; // safety limit

      const params = new URLSearchParams({
        access_token: accessToken,
        fields: "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id",
        limit: "100",
        filtering: JSON.stringify([
          { field: "time_created", operator: "GREATER_THAN", value: fromTs },
          { field: "time_created", operator: "LESS_THAN", value: toTs },
        ]),
        ...(nextCursor ? { after: nextCursor } : {}),
      });

      try {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${formId}/leads?${params}`,
          { signal: AbortSignal.timeout(15000) },
        );

        if (!res.ok) {
          const err = await res.text().catch(() => "");
          this.logger.warn(`Meta Graph API error for form ${formId}: ${res.status} ${err}`);
          break;
        }

        const data = (await res.json()) as MetaLeadsResponse;
        results.push(...(data.data ?? []));
        nextCursor = data.paging?.cursors?.after ?? undefined;

        if (!data.paging?.next) break;
      } catch (err) {
        this.logger.warn(`Meta Graph API fetch failed for form ${formId}: ${(err as Error).message}`);
        break;
      }
    } while (nextCursor);

    return results;
  }
}
