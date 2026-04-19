import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { EventType, Prisma, MessageChannel, LeadStatus } from "@inmoflow/db";
import { PrismaService } from "../prisma/prisma.service";
import { AiAgentService } from "./ai-agent.service";
import { MessageSenderService } from "./message-sender.service";

// ─── Working hours types ──────────────────────────────

interface WorkingHoursSchedule {
  day: number;  // 0 = Sunday … 6 = Saturday
  from: string; // "HH:mm"
  to: string;   // "HH:mm"
}

interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: WorkingHoursSchedule[];
}

/**
 * RuleEngineService — evaluates tenant rules and executes actions.
 *
 * Supported triggers: lead.created, lead.updated, lead.assigned, lead.contacted, message.inbound, stage.changed, no_response
 * Supported actions: assign, send_template, change_status, change_stage, add_note, notify, send_ai_message, wait
 *
 * Rule scoping:
 * - Global rules (userId = null): fire for ALL leads in the tenant.
 * - User rules (userId = X): fire ONLY when the lead is assigned to user X.
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAgent: AiAgentService,
    private readonly messageSender: MessageSenderService,
    @InjectQueue("workflow") private readonly workflowQueue: Queue,
    @InjectQueue("lead") private readonly leadQueue: Queue,
  ) {}

  /**
   * Main entry point: find matching rules and execute their actions.
   */
  async evaluate(
    tenantId: string,
    trigger: string,
    leadId: string,
    context: Record<string, unknown> = {},
  ): Promise<{ rulesMatched: number; actionsExecuted: number }> {
    // Get lead data first — needed for both rule scoping and condition evaluation
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { stage: true, source: true, assignee: true },
    });

    if (!lead) {
      this.logger.warn(`Lead ${leadId} not found for rule evaluation`);
      return { rulesMatched: 0, actionsExecuted: 0 };
    }

    // Fetch rules scoped to this lead's assignee:
    //  - Global rules (userId IS NULL) always fire.
    //  - User-specific rules fire ONLY when the lead is assigned to that user.
    //  - Exception: for lead.created on an unassigned lead, all rules run so
    //    assignment automations (e.g. "assign based on form name") can fire.
    let ruleUserFilter: Prisma.RuleWhereInput = {};
    if (lead.assigneeId) {
      // Lead already assigned: global rules + rules scoped to the assignee
      ruleUserFilter = { OR: [{ userId: null }, { userId: lead.assigneeId }] };
    } else if (trigger !== "lead.created") {
      // No assignee and not a creation event: global rules only
      ruleUserFilter = { userId: null };
    }
    // lead.created with no assignee → no userId filter, all rules run

    const ruleWhere: Prisma.RuleWhereInput = {
      tenantId,
      trigger,
      enabled: true,
      ...ruleUserFilter,
    };

    const rules = await this.prisma.rule.findMany({
      where: ruleWhere,
      orderBy: { priority: "asc" },
    });

    if (rules.length === 0) return { rulesMatched: 0, actionsExecuted: 0 };

    // Build evaluation context
    // formName: prefer source.metaFormName (for single-form sources), fallback to event context,
    // then parse from notes header "Formulario: ..." (covers catch-all sources like "todos los formularios")
    const formNameFromNotes = lead.notes
      ? (lead.notes.match(/^Formulario:\s*(.+)$/m)?.[1]?.trim() ?? null)
      : null;
    const evalContext: Record<string, unknown> = {
      ...context,
      status: lead.status,
      stageKey: lead.stage?.key,
      sourceType: lead.source?.type,
      sourceName: lead.source?.name,
      formName: lead.source?.metaFormName ?? (context.formName as string | null) ?? formNameFromNotes ?? null,
      hasPhone: !!lead.phone,
      hasEmail: !!lead.email,
      intent: lead.intent,
      primaryChannel: lead.primaryChannel,
      assigneeId: lead.assigneeId,
      hasAssignee: !!lead.assigneeId,
    };

    // Expose custom Meta form answers as form_<field_key> in evalContext
    // so rules can condition on them (e.g. form_tipo_de_propiedad = "Casa")
    const formFields = this.parseFormFields(lead.notes ?? "");
    for (const [k, v] of Object.entries(formFields)) {
      evalContext[`form_${k}`] = v;
    }
    // Canonical aliases for easy rule conditions
    if (formFields["tipo_propiedad"]) evalContext["tipo_propiedad"] = formFields["tipo_propiedad"];
    if (formFields["zona"]) evalContext["zona"] = formFields["zona"];
    if (formFields["interes"]) evalContext["interesado"] = formFields["interes"];

    // Pre-resolve {{propiedad}} so the QueuedAction context has the display-ready value.
    // Priority 1: extract from the qualifier question in notes "contacto por X de U$S..."
    // Priority 2: compose from tipo_propiedad + zona form fields
    if (!evalContext["propiedad"]) {
      const notesText = lead.notes ?? "";
      const questionMatch = notesText.match(/(?:contacto\s+por|por\s+la?\s+)\s+(.+?)\s+de\s+[Uu]\$[Ss]/i);
      if (questionMatch?.[1]) {
        evalContext["propiedad"] = questionMatch[1].trim();
      } else {
        const SPANISH_ARTICLES: Record<string, string> = {
          casa: "la casa", apartamento: "el apartamento", apto: "el apartamento",
          depto: "el departamento", terreno: "el terreno", local: "el local",
          deposito: "el depósito", galpón: "el galpón", galpon: "el galpón",
          garage: "el garage", oficina: "la oficina",
        };
        // Try direct "propiedad" form field first
        const propField = formFields["propiedad"] ?? formFields["tipo_de_propiedad"] ?? formFields["tipo_propiedad"] ?? "";
        const zonaField = formFields["zona"] ?? "";
        if (propField) {
          const article = SPANISH_ARTICLES[propField.toLowerCase()] ?? propField;
          evalContext["propiedad"] = zonaField ? `${article} en ${zonaField}` : article;
        } else if (evalContext["tipo_propiedad"]) {
          const t = String(evalContext["tipo_propiedad"]);
          const article = SPANISH_ARTICLES[t.toLowerCase()] ?? t;
          evalContext["propiedad"] = zonaField ? `${article} en ${zonaField}` : article;
        }
      }
    }

    let rulesMatched = 0;
    let actionsExecuted = 0;
    let rulesQueued = 0;

    for (const rule of rules) {
      const conditions = (rule.conditions as Record<string, unknown>) ?? {};

      if (!this.evaluateConditions(conditions, evalContext)) {
        continue;
      }

      rulesMatched++;
      this.logger.log(`Rule matched: "${rule.name}" (${rule.id}) for lead ${leadId}`);

      // ── Working hours check ─────────────────────────
      const wh = rule.workingHours as unknown as WorkingHours | null;
      if (wh && wh.enabled && !this.isWithinWorkingHours(wh)) {
        // Queue the action for later processing
        const nextWindow = this.getNextWorkingWindowStart(wh);
        await this.prisma.queuedAction.create({
          data: {
            tenantId,
            ruleId: rule.id,
            leadId,
            assigneeId: lead.assigneeId ?? null, // track which agent owns this lead
            trigger,
            context: { ...evalContext } as unknown as Prisma.InputJsonValue,
            status: "pending",
            processAt: nextWindow,
          },
        });

        rulesQueued++;
        this.logger.log(
          `Rule "${rule.name}" queued — outside working hours. Next window: ${nextWindow?.toISOString() ?? "unknown"}`,
        );

        await this.prisma.eventLog.create({
          data: {
            tenantId,
            type: EventType.workflow_executed,
            entity: "Rule",
            entityId: rule.id,
            status: "ok",
            message: `Rule "${rule.name}" queued (outside working hours) for lead ${leadId}. Scheduled: ${nextWindow?.toISOString() ?? "next window"}`,
            payload: {
              ruleId: rule.id,
              leadId,
              trigger,
              queued: true,
              processAt: nextWindow?.toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        continue;
      }

      const actions = (rule.actions as unknown as RuleAction[]) ?? [];

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        try {
          // Handle wait/delay actions — defer remaining actions as delayed BullMQ job
          if (action.type === "wait" && action.delayMs) {
            const remaining = actions.slice(i + 1);
            if (remaining.length > 0) {
              await this.workflowQueue.add(
                "workflow.continue-actions",
                { tenantId, leadId, ruleId: rule.id, ruleName: rule.name, actions: remaining },
                { delay: Math.min(action.delayMs, 86_400_000) }, // cap at 24h
              );
              this.logger.debug(`Deferred ${remaining.length} action(s) by ${action.delayMs}ms for rule "${rule.name}"`);
            }
            actionsExecuted++;
            break; // stop processing this rule's actions — remainder is deferred
          }

          await this.executeAction(tenantId, leadId, action, evalContext);
          actionsExecuted++;
        } catch (err) {
          this.logger.error(
            `Action ${action.type} failed for rule "${rule.name}": ${(err as Error).message}`,
          );

          try {
            await this.prisma.eventLog.create({
              data: {
                tenantId,
                type: EventType.workflow_failed,
                entity: "Rule",
                entityId: rule.id,
                status: "error",
                message: `Action ${action.type} failed: ${(err as Error).message}`,
                payload: { ruleId: rule.id, action: action.type, leadId } as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (logErr) {
            this.logger.error(
              `Failed to log action error for rule "${rule.name}": ${(logErr as Error).message}`,
            );
          }
        }
      }

      // Log successful workflow execution (wrapped in try/catch to prevent
      // BullMQ job retry after actions have already been executed, which would
      // cause duplicate template sends).
      try {
        await this.prisma.eventLog.create({
          data: {
            tenantId,
            type: EventType.workflow_executed,
            entity: "Rule",
            entityId: rule.id,
            status: "ok",
            message: `Rule "${rule.name}" executed ${actions.length} action(s) for lead ${leadId}`,
            payload: {
              ruleId: rule.id,
              leadId,
              trigger,
              actionsCount: actions.length,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (logErr) {
        this.logger.error(
          `Failed to log workflow execution for rule "${rule.name}": ${(logErr as Error).message}`,
        );
      }
    }

    return { rulesMatched, actionsExecuted };
  }

  /** Execute a single rule by ID (for manual "Run Now" from UI) */
  async executeSingleRule(
    tenantId: string,
    ruleId: string,
    leadId: string,
    messageOverride?: string,
  ): Promise<{ actionsExecuted: number }> {
    const rule = await this.prisma.rule.findFirst({
      where: { id: ruleId, tenantId },
    });
    if (!rule) {
      this.logger.warn(`Rule ${ruleId} not found in tenant ${tenantId}`);
      return { actionsExecuted: 0 };
    }

    const actions = (rule.actions as unknown as RuleAction[]) ?? [];
    let actionsExecuted = 0;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        if (action.type === "wait" && action.delayMs) {
          const remaining = actions.slice(i + 1);
          if (remaining.length > 0) {
            await this.workflowQueue.add(
              "workflow.continue-actions",
              { tenantId, ruleId, leadId, ruleName: rule.name, actions: remaining },
              { delay: Math.min(action.delayMs, 86_400_000) },
            );
            this.logger.debug(`Deferred ${remaining.length} action(s) by ${action.delayMs}ms for rule "${rule.name}"`);
          }
          actionsExecuted++;
          break;
        }
        await this.executeAction(tenantId, leadId, action, {}, messageOverride);
        actionsExecuted++;
      } catch (err) {
        this.logger.error(`Action ${action.type} failed for rule "${rule.name}": ${(err as Error).message}`);
      }
    }

    await this.prisma.eventLog.create({
      data: {
        tenantId,
        type: EventType.workflow_executed,
        entity: "Rule",
        entityId: rule.id,
        status: "ok",
        message: `Manual execution: Rule "${rule.name}" ran ${actionsExecuted} action(s) for lead ${leadId}`,
        payload: { ruleId: rule.id, leadId, actionsCount: actions.length } as unknown as Prisma.InputJsonValue,
      },
    });

    return { actionsExecuted };
  }

  /**
   * Evaluate conditions against context.
   * Each key in conditions must match the context value.
   * Array values mean "any of" (OR).
   */
  private evaluateConditions(
    conditions: Record<string, unknown>,
    context: Record<string, unknown>,
  ): boolean {
    if (Object.keys(conditions).length === 0) return true;

    for (const [key, value] of Object.entries(conditions)) {
      if (value === undefined || value === null) continue;
      const ctxVal = context[key];

      // Support operator objects: { field: { op: "gte", value: 5 } }
      // Also support frontend shorthand: { field: { contains: "x" } }
      if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        const raw = value as Record<string, unknown>;

        // Normalise: { op: "contains", value: "x" } or { contains: "x" }
        let op: string | undefined;
        let opValue: unknown;

        if (raw.op !== undefined && raw.value !== undefined) {
          // Canonical format: { op, value }
          op = String(raw.op);
          opValue = raw.value;
        } else {
          // Shorthand format from frontend: { contains: "x" }, { not_contains: "x" }, etc.
          const keys = Object.keys(raw);
          if (keys.length === 1) {
            op = keys[0];
            opValue = raw[op];
          }
        }

        if (op && opValue !== undefined) {
          const numCtx = Number(ctxVal);
          const numVal = Number(opValue);
          // Case-insensitive helpers for string comparisons
          const strCtx = typeof ctxVal === "string" ? ctxVal.toLowerCase() : undefined;
          const strVal = typeof opValue === "string" ? opValue.toLowerCase() : undefined;
          switch (op) {
            case "eq":
            case "equals":
              if (strCtx !== undefined && strVal !== undefined) { if (strCtx !== strVal) return false; }
              else { if (ctxVal !== opValue) return false; }
              break;
            case "neq":
            case "not_equals":
              if (strCtx !== undefined && strVal !== undefined) { if (strCtx === strVal) return false; }
              else { if (ctxVal === opValue) return false; }
              break;
            case "gt":
            case "greater_than":
              if (numCtx <= numVal) return false; break;
            case "gte": if (numCtx < numVal) return false; break;
            case "lt":
            case "less_than":
              if (numCtx >= numVal) return false; break;
            case "lte": if (numCtx > numVal) return false; break;
            case "contains":
              if (typeof ctxVal !== "string" || !ctxVal.toLowerCase().includes(String(opValue).toLowerCase())) return false;
              break;
            case "not_contains":
              if (typeof ctxVal === "string" && ctxVal.toLowerCase().includes(String(opValue).toLowerCase())) return false;
              break;
            default: break;
          }
          continue;
        }
      }

      if (Array.isArray(value)) {
        // Case-insensitive array match for strings
        const ctxLower = typeof ctxVal === "string" ? ctxVal.toLowerCase() : ctxVal;
        if (!value.some(v => (typeof v === "string" ? v.toLowerCase() : v) === ctxLower)) return false;
      } else if (typeof ctxVal === "string" && typeof value === "string") {
        if (ctxVal.toLowerCase() !== value.toLowerCase()) return false;
      } else if (ctxVal !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute a single rule action.
   */
  private async executeAction(
    tenantId: string,
    leadId: string,
    action: RuleAction,
    ctx: Record<string, unknown> = {},
    messageOverride?: string,
  ): Promise<void> {
    switch (action.type) {
      case "assign":
        await this.actionAssign(tenantId, leadId, action);
        break;
      case "assign_by_form_name":
        await this.actionAssignByFormName(tenantId, leadId, ctx);
        break;
      case "send_template":
        await this.actionSendTemplate(tenantId, leadId, action, messageOverride);
        break;
      case "change_status":
        await this.actionChangeStatus(tenantId, leadId, action);
        break;
      case "change_stage":
        await this.actionChangeStage(tenantId, leadId, action);
        break;
      case "add_note":
        await this.actionAddNote(tenantId, leadId, action);
        break;
      case "notify":
        await this.actionNotify(tenantId, leadId, action);
        break;
      case "send_ai_message":
        await this.actionSendAiMessage(tenantId, leadId, action);
        break;
      default:
        this.logger.warn(`Unknown action type: ${(action as RuleAction).type}`);
    }
  }

  // ─── Individual actions ────────────────────────────

  /**
   * Assign the lead to the agent whose name appears in the Meta form name.
   * Form names like "Casa en Bello Horizonte - Javier" → assigns to user named Javier.
   */
  private async actionAssignByFormName(tenantId: string, leadId: string, ctx: Record<string, unknown> = {}) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { source: true },
    });

    const formName = lead?.source?.metaFormName ?? (ctx.formName as string | null) ?? null;
    if (!formName) {
      this.logger.debug(`assign_by_form_name: no formName for lead ${leadId}, skipping`);
      return;
    }

    const agents = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
    });

    const formNameLower = formName.toLowerCase();
    // Find agent whose name (or any word of it) appears in the form name
    const matched = agents.find((u) => {
      if (!u.name) return false;
      const nameParts = u.name.toLowerCase().split(/\s+/);
      return nameParts.some((part) => part.length >= 3 && formNameLower.includes(part));
    });

    if (!matched) {
      this.logger.warn(`assign_by_form_name: no agent name found in formName "${formName}" for lead ${leadId}`);
      return;
    }

    const prevLead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { assigneeId: true } });
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assigneeId: matched.id },
    });

    this.logger.log(`assign_by_form_name: assigned lead ${leadId} to ${matched.name} (matched "${formName}")`);

    await this.leadQueue.add(
      "lead.assigned",
      { tenantId, leadId, assigneeId: matched.id, previousAssigneeId: prevLead?.assigneeId ?? null },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 },
    );
  }

  private async actionAssign(tenantId: string, leadId: string, action: RuleAction) {
    let userId = action.userId;

    if (userId === "round_robin") {
      // Simple round-robin: find user with fewest assigned leads
      const users = await this.prisma.user.findMany({
        where: { tenantId, role: { in: ["AGENT"] }, isActive: true },
        include: { _count: { select: { assignedLeads: true } } },
        orderBy: { createdAt: "asc" },
      });

      if (users.length === 0) return;

      users.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads);
      userId = users[0].id;
    }

    if (!userId) return;

    const prevLead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { assigneeId: true } });
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assigneeId: userId },
    });

    this.logger.debug(`Assigned lead ${leadId} to user ${userId}`);

    await this.leadQueue.add(
      "lead.assigned",
      { tenantId, leadId, assigneeId: userId, previousAssigneeId: prevLead?.assigneeId ?? null },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 },
    );
  }

  private async actionSendTemplate(tenantId: string, leadId: string, action: RuleAction, messageOverride?: string) {
    if (!action.templateKey) return;

    const template = await this.prisma.template.findUnique({
      where: { tenantId_key: { tenantId, key: action.templateKey } },
    });

    if (!template || !template.enabled) {
      this.logger.warn(`Template "${action.templateKey}" not found or disabled`);
      return;
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { source: true, stage: true, assignee: true },
    });
    if (!lead) return;

    // Parse custom form answers from notes
    const formFields = this.parseFormFields(lead.notes ?? "");

    // ── {{propiedad}}: extract from form name or question text
    // Priority 1: extract text between "contacto por" and "de U$S" from the form question stored in notes
    // e.g. "...en contacto por la Casa en Venta en Cordón de U$S 138.000?" → "la Casa en Venta en Cordón"
    // Priority 2: strip the agent suffix from metaFormName
    // e.g. "Casa en Venta en Cordón de U$S 138.000 - David" → "Casa en Venta en Cordón de U$S 138.000"
    const formName: string = lead.source?.metaFormName ?? "";
    const PROPERTY_PREFIXES = /^(casa|apartamento|apto|terreno|local|depósito|deposito|galpón|galpon|garage|oficina|chacra|campo|ph|penthouse|padrón|padron|la |el |los |las )/i;
    let propertyDesc = "";

    // Try extracting from the qualifier question text: "por <PROPIEDAD> de U$S"
    const notes = lead.notes ?? "";
    const questionMatch = notes.match(/(?:contacto\s+por|por\s+la?\s+)\s+(.+?)\s+de\s+[Uu]\$[Ss]/i);
    if (questionMatch?.[1]) {
      propertyDesc = questionMatch[1].trim();
    }

    // Fallback: strip trailing " - AgentName" from form name
    if (!propertyDesc && formName) {
      propertyDesc = formName.replace(/\s*[-–—]\s*[\w][\w\s-]{0,30}$/, "").trim();
      if (!propertyDesc || propertyDesc.length < 3) propertyDesc = formName;
    }

    // Last fallback: compose from separate tipo/zona fields
    if (!propertyDesc || !PROPERTY_PREFIXES.test(propertyDesc)) {
      const PROPERTY_TYPE_KEYS = ["tipo_de_propiedad", "propiedad", "tipo", "inmueble"];
      const LOCATION_KEYS = ["zona", "barrio", "ubicacion", "localidad", "ciudad", "localización", "lugar", "departamento"];
      const SPANISH_ARTICLES: Record<string, string> = {
        casa: "la casa", apartamento: "el apartamento", apto: "el apartamento", depto: "el departamento",
        terreno: "el terreno", local: "el local", "local comercial": "el local comercial",
        deposito: "el depósito", depósito: "el depósito", galpón: "el galpón", galpon: "el galpón",
        garage: "el garage", oficina: "la oficina", chacra: "la chacra", campo: "el campo",
      };
      let propertyType = "";
      let propertyLocation = "";
      for (const [k, v] of Object.entries(formFields)) {
        if (PROPERTY_TYPE_KEYS.some((pk) => k.includes(pk))) propertyType = v;
        if (LOCATION_KEYS.some((lk) => k.includes(lk))) propertyLocation = v;
      }
      if (propertyType) {
        const article = SPANISH_ARTICLES[propertyType.toLowerCase()] ?? propertyType;
        if (!propertyDesc) propertyDesc = propertyLocation ? `${article} en ${propertyLocation}` : article;
      } else if (propertyLocation && !propertyDesc) {
        propertyDesc = `la propiedad en ${propertyLocation}`;
      }
    }
    propertyDesc = propertyDesc || lead.intent || "";

    // Build {{formulario}} — all custom form answers in readable format
    const formularioLines = Object.entries(formFields)
      .filter(([k]) => !["tipo_propiedad", "zona", "interes"].includes(k)) // skip aliases
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
    const formulario = formularioLines.join("\n");

    // Render placeholders — all available lead variables
    const variables: Record<string, string> = {
      nombre: lead.name ?? "cliente",
      name: lead.name ?? "cliente",
      telefono: lead.phone ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      fuente: lead.source?.name ?? "",
      source: lead.source?.name ?? "",
      etapa: lead.stage?.name ?? "",
      stage: lead.stage?.name ?? "",
      estado: lead.status ?? "",
      status: lead.status ?? "",
      agente: lead.assignee?.name ?? "",
      agent: lead.assignee?.name ?? "",
      intencion: lead.intent ?? "",
      intent: lead.intent ?? "",
      propiedad: propertyDesc,
      formulario,
      tipo_propiedad: formFields["tipo_propiedad"] ?? "",
      zona: formFields["zona"] ?? "",
      interesado: formFields["interes"] ?? "",
      notas: lead.notes ?? "",
      notes: lead.notes ?? "",
      // Expose each form field directly as {{form_<key>}}
      ...Object.fromEntries(Object.entries(formFields).map(([k, v]) => [`form_${k}`, v])),
    };

    // Use manual override if provided, otherwise render the template with variables
    const rendered = messageOverride
      ? messageOverride
      : template.content.replace(
          /\{\{(\w+)\}\}/g,
          (_match: string, key: string) => variables[key] ?? `{{${key}}}`,
        );

    if (messageOverride) {
      this.logger.log(`Using messageOverride for lead ${leadId} (template: "${action.templateKey}")`);
    }

    // ── Deduplication: prevent sending the same template to the same lead
    // within a short window (e.g. BullMQ job retry after transient failure).
    const dedupeWindow = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    const recentDuplicate = await this.prisma.message.findFirst({
      where: {
        tenantId,
        leadId,
        direction: "OUT",
        content: rendered,
        createdAt: { gte: dedupeWindow },
      },
    });

    if (recentDuplicate) {
      this.logger.warn(
        `Template "${action.templateKey}" already sent to lead ${leadId} within dedup window — skipping duplicate`,
      );
      return;
    }

    const channel = ((template.channel as string) ?? lead.primaryChannel ?? "WEB") as MessageChannel;
    const attachments = (template.attachments as Array<{ url: string; originalName: string; mimeType: string }>) ?? [];

    // Determine the public base URL for attachments (relative URLs need to become absolute)
    const apiUrl = (process.env.API_PUBLIC_URL ?? process.env.CORS_ORIGINS?.split(",")[0] ?? "http://localhost:4000").replace(/\/+$/, "");

    // Send each attachment as a separate media message
    for (const att of attachments) {
      const absoluteUrl = att.url.startsWith("http") ? att.url : `${apiUrl}${att.url}`;
      const mediaType = this.mimeToMediaType(att.mimeType);
      const msg = await this.prisma.message.create({
        data: {
          tenantId,
          leadId,
          direction: "OUT",
          channel,
          content: att.originalName,
          mediaUrl: absoluteUrl,
          mediaType,
          status: "queued",
        },
      });
      await this.messageSender.sendQueuedMessage(msg.id);
    }

    // Save the text content as an outbound message (even if empty, to keep flow consistent)
    if (rendered.trim()) {
      const msg = await this.prisma.message.create({
        data: {
          tenantId,
          leadId,
          direction: "OUT",
          channel,
          content: rendered,
          status: "queued",
        },
      });
      await this.messageSender.sendQueuedMessage(msg.id);
    }

    this.logger.debug(`Template "${action.templateKey}" sent for lead ${leadId}`);
  }

  /** Map MIME type to a simplified media type for providers */
  private mimeToMediaType(mimeType: string): string {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "document";
  }

  /**
   * Parse custom Meta form field answers from lead notes.
   * Expects lines like "• ¿qué tipo de propiedad querés vender?: Casa" after "Respuestas del formulario:".
   * Returns:
   *  - Normalized keys (lowercase, no accents/punctuation, underscores) → raw answer
   *  - Canonical semantic aliases: tipo_propiedad, zona, interes
   */
  private parseFormFields(notes: string): Record<string, string> {
    const result: Record<string, string> = {};
    const marker = "Respuestas del formulario:";
    const sectionIdx = notes.indexOf(marker);
    if (sectionIdx === -1) return result;

    const normalizeKey = (raw: string): string =>
      raw
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[¿?¡!(),;:"']/g, "")                   // remove punctuation
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")                       // only alphanumeric + _
        .replace(/^_+|_+$/g, "");                         // trim underscores

    const PROPERTY_TYPE_SEEDS = ["tipo", "propiedad", "inmueble", "vender", "alquilar", "venta"];
    const LOCATION_SEEDS = ["zona", "barrio", "ubica", "donde", "localidad", "ciudad", "lugar", "departamento"];
    const INTEREST_SEEDS = ["interesa", "contacto", "agente", "ponga", "comunique"];

    const section = notes.slice(sectionIdx + marker.length);
    for (const line of section.split("\n")) {
      const match = line.match(/^[•\-]\s+(.+?):\s+(.+)$/);
      if (!match) continue;

      const rawLabel = match[1].trim();
      const value = match[2].trim();
      const key = normalizeKey(rawLabel);
      if (!key) continue;

      result[key] = value;

      // Canonical aliases based on what the question is about
      if (PROPERTY_TYPE_SEEDS.some((s) => key.includes(s)) && !("tipo_propiedad" in result)) {
        result["tipo_propiedad"] = value;
      }
      if (LOCATION_SEEDS.some((s) => key.includes(s)) && !("zona" in result)) {
        result["zona"] = value;
      }
      const isSiNo = /^(si|sí|no)$/i.test(value);
      if (isSiNo && INTEREST_SEEDS.some((s) => key.includes(s))) {
        result["interes"] = value.toLowerCase().startsWith("s") ? "Si" : "No";
      }
    }
    return result;
  }

  private async actionChangeStatus(tenantId: string, leadId: string, action: RuleAction) {
    if (!action.value) return;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: action.value as LeadStatus },
    });

    this.logger.debug(`Lead ${leadId} status → ${action.value}`);
  }

  private async actionChangeStage(tenantId: string, leadId: string, action: RuleAction) {
    if (!action.value) return;

    const stage = await this.prisma.leadStage.findUnique({
      where: { tenantId_key: { tenantId, key: action.value } },
    });

    if (!stage) {
      this.logger.warn(`Stage "${action.value}" not found for tenant ${tenantId}`);
      return;
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { stageId: stage.id },
    });

    this.logger.debug(`Lead ${leadId} stage → ${action.value}`);
  }

  private async actionAddNote(tenantId: string, leadId: string, action: RuleAction) {
    if (!action.content) return;

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) return;

    const existingNotes = lead.notes ?? "";
    const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const newNotes = existingNotes
      ? `${existingNotes}\n[${timestamp}] ${action.content}`
      : `[${timestamp}] ${action.content}`;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { notes: newNotes },
    });

    this.logger.debug(`Note added to lead ${leadId}`);
  }

  private async actionNotify(tenantId: string, leadId: string, action: RuleAction) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });

    const targetUserId = action.userId ?? lead?.assigneeId;

    if (targetUserId) {
      await this.prisma.notification.create({
        data: {
          tenantId,
          userId: targetUserId,
          type: "rule",
          title: action.content ?? "Notificación de automatización",
          message: `Lead: ${lead?.name ?? leadId}`,
          entity: "Lead",
          entityId: leadId,
        },
      });
    }

    this.logger.debug(`Notification created for lead ${leadId}`);
  }

  /**
   * send_ai_message — Generates an AI response using the tenant's configured AI provider.
   * Also activates "AI conversation mode" on the lead so subsequent inbound messages
   * are automatically answered by the AI until an agent takes over.
   */
  private async actionSendAiMessage(tenantId: string, leadId: string, action: RuleAction) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });
    if (!lead) return;

    const instruction = action.content ?? "Envía un mensaje de seguimiento amable";
    const channel = (action.channel ?? lead.primaryChannel ?? "WEB") as MessageChannel;

    // Try real AI agent first
    const aiResult = await this.aiAgent.generateResponse(tenantId, leadId, instruction);

    let aiMessage: string;
    let isAiGenerated = false;

    if (aiResult) {
      aiMessage = aiResult.content;
      isAiGenerated = true;
      this.logger.debug(`AI response from ${aiResult.provider}/${aiResult.model} for lead ${leadId}`);
    } else {
      // No AI provider configured — skip sending to avoid static spam
      this.logger.warn(`AI not available for tenant ${tenantId}, skipping send_ai_message for lead ${leadId}`);
      return;
    }

    // ── Activate AI conversation mode on the lead ──
    // This keeps the AI responding to every subsequent inbound message
    // until a human agent takes over, deactivates it manually, or the AI achieves its goal.
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        aiConversationActive: true,
        aiInstruction: instruction,
        aiGoal: action.goal ?? null,
        aiRuleId: null, // will be set in executeSingleRule if needed
      },
    });
    this.logger.log(`AI conversation ACTIVATED for lead ${leadId} — instruction: "${instruction.slice(0, 60)}…"`);

    const msg = await this.prisma.message.create({
      data: {
        tenantId,
        leadId,
        direction: "OUT",
        channel,
        content: aiMessage,
        status: "queued",
        rawPayload: {
          aiGenerated: isAiGenerated,
          instruction,
          ...(aiResult ? { provider: aiResult.provider, model: aiResult.model } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Attempt delivery through the correct agent's channel
    await this.messageSender.sendQueuedMessage(msg.id);

    this.logger.debug(`AI message sent for lead ${leadId}: "${instruction}"`);
  }

  // ─── AI Conversation Auto-Reply ─────────────────────

  /**
   * Called by MessageProcessor on every inbound message.
   * If the lead has `aiConversationActive = true`, generates and sends an AI reply
   * using the stored instruction. Returns true if a reply was sent.
   */
  async handleAiAutoReply(
    tenantId: string,
    leadId: string,
    inboundMessage: string,
  ): Promise<boolean> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });

    if (!lead || !lead.aiConversationActive) return false;

    const instruction = lead.aiInstruction ?? "Respondé al cliente de forma amable y profesional";
    const channel = (lead.primaryChannel ?? "WEB") as MessageChannel;

    // Check AI availability
    const available = await this.aiAgent.isAvailable(tenantId, lead.assigneeId);
    if (!available) {
      this.logger.warn(`AI not available for auto-reply — lead ${leadId}`);
      return false;
    }

    // Generate AI response with full history + the latest inbound message
    const aiResult = await this.aiAgent.generateResponse(
      tenantId,
      leadId,
      instruction,
      inboundMessage,
    );

    if (!aiResult) {
      this.logger.warn(`AI failed to generate auto-reply for lead ${leadId}`);
      return false;
    }

    // Check for AI conversation markers
    const GOAL_MARKER = "[META_CUMPLIDA]";
    const NOT_INTERESTED_MARKER = "[LEAD_NO_INTERESADO]";
    const STAGE_REGEX = /\[ETAPA:(QUALIFIED|NEGOTIATION|VISIT)\]/i;
    const APPOINTMENT_REGEX = /\[CITA:(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\]/i;
    const goalAchieved = aiResult.content.includes(GOAL_MARKER);
    const notInterested = aiResult.content.includes(NOT_INTERESTED_MARKER);
    const stageMatch = aiResult.content.match(STAGE_REGEX);
    const newStage = stageMatch ? stageMatch[1].toUpperCase() : null;
    const appointmentMatch = aiResult.content.match(APPOINTMENT_REGEX);
    const cleanContent = aiResult.content
      .replace(GOAL_MARKER, "")
      .replace(NOT_INTERESTED_MARKER, "")
      .replace(STAGE_REGEX, "")
      .replace(APPOINTMENT_REGEX, "")
      .trim();

    // Save and send through the agent's WhatsApp
    const msg = await this.prisma.message.create({
      data: {
        tenantId,
        leadId,
        direction: "OUT",
        channel,
        content: cleanContent,
        status: "queued",
        rawPayload: {
          aiGenerated: true,
          aiAutoReply: true,
          aiDemoMode: !!lead.aiDemoMode,
          aiGoalAchieved: goalAchieved,
          aiNotInterested: notInterested,
          ...(newStage && { aiStageAdvanced: newStage }),
          instruction,
          provider: aiResult.provider,
          model: aiResult.model,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.messageSender.sendQueuedMessage(msg.id);

    this.logger.log(
      `AI auto-reply sent for lead ${leadId}: "${cleanContent.slice(0, 60)}…" (${aiResult.provider}/${aiResult.model})`,
    );

    // If goal was achieved, auto-deactivate AI and notify the agent
    if (goalAchieved) {
      this.logger.log(`🎯 AI GOAL ACHIEVED for lead ${leadId}: "${lead.aiGoal}"`);

      await this.deactivateAiConversation(tenantId, leadId, `goal_achieved: ${lead.aiGoal ?? "meta cumplida"}`);

      // Notify the assigned agent
      if (lead.assigneeId) {
        await this.prisma.notification.create({
          data: {
            tenantId,
            userId: lead.assigneeId,
            type: "rule",
            title: "🎯 IA completó su meta",
            message: `La IA logró "${lead.aiGoal ?? "su objetivo"}" con el lead ${lead.name ?? "sin nombre"}. La conversación IA fue desactivada automáticamente.`,
            entity: "Lead",
            entityId: leadId,
          },
        });
      }

      // Advance lead status to VISIT if it's in an earlier stage
      const visitStages: string[] = ["NEW", "CONTACTED", "QUALIFIED"];
      if (visitStages.includes(lead.status)) {
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { status: "VISIT" },
        });
        this.logger.log(`Lead ${leadId} status advanced to VISIT after AI goal achieved`);
      }
    }

    // If lead is not interested, auto-deactivate AI and mark as LOST
    if (notInterested) {
      this.logger.log(`❌ LEAD NOT INTERESTED for lead ${leadId}`);

      await this.deactivateAiConversation(tenantId, leadId, "lead_not_interested");

      // Notify the assigned agent
      if (lead.assigneeId) {
        await this.prisma.notification.create({
          data: {
            tenantId,
            userId: lead.assigneeId,
            type: "rule",
            title: "❌ Lead no interesado",
            message: `El lead ${lead.name ?? "sin nombre"} indicó que no está interesado. La IA se despidió amablemente y fue desactivada.`,
            entity: "Lead",
            entityId: leadId,
          },
        });
      }

      // Mark lead as LOST
      const lostableStages: string[] = ["NEW", "CONTACTED", "QUALIFIED"];
      if (lostableStages.includes(lead.status)) {
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { status: "LOST" },
        });
        this.logger.log(`Lead ${leadId} status changed to LOST — not interested`);
      }
    }

    // If AI detected a stage progression (and no goal/lost already handled it)
    if (newStage && !goalAchieved && !notInterested) {
      const STAGE_ORDER: Record<string, number> = {
        NEW: 0, CONTACTED: 1, QUALIFIED: 2, NEGOTIATION: 3, VISIT: 4, WON: 5, LOST: 6,
      };
      const currentOrder = STAGE_ORDER[lead.status] ?? 0;
      const targetOrder = STAGE_ORDER[newStage] ?? 0;

      // Only advance forward, never regress
      if (targetOrder > currentOrder) {
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { status: newStage as any },
        });

        const STAGE_LABELS: Record<string, string> = {
          QUALIFIED: "Calificado",
          NEGOTIATION: "Negociación",
          VISIT: "Visita",
        };

        this.logger.log(`Lead ${leadId} advanced: ${lead.status} → ${newStage}`);

        // Notify agent of stage change
        if (lead.assigneeId) {
          await this.prisma.notification.create({
            data: {
              tenantId,
              userId: lead.assigneeId,
              type: "rule",
              title: `📊 Lead avanzó a ${STAGE_LABELS[newStage] ?? newStage}`,
              message: `La IA avanzó al lead ${lead.name ?? "sin nombre"} de ${STAGE_LABELS[lead.status] ?? lead.status} a ${STAGE_LABELS[newStage] ?? newStage} basándose en la conversación.`,
              entity: "Lead",
              entityId: leadId,
            },
          });
        }
      }
    }

    // If AI confirmed an appointment, create a Visit record
    if (appointmentMatch) {
      const [, dateStr, timeStr] = appointmentMatch;
      try {
        const appointmentDate = new Date(`${dateStr}T${timeStr}:00`);
        const appointmentEnd = new Date(appointmentDate.getTime() + 3600000); // +1 hour

        if (!isNaN(appointmentDate.getTime())) {
          const visit = await this.prisma.visit.create({
            data: {
              tenantId,
              leadId,
              agentId: lead.assigneeId ?? undefined,
              date: appointmentDate,
              endDate: appointmentEnd,
              status: "SCHEDULED",
              notes: `Cita agendada automáticamente por IA. Lead: ${lead.name ?? "sin nombre"}`,
              createdByAi: true,
            },
          });

          this.logger.log(`📅 AI created appointment for lead ${leadId}: ${dateStr} ${timeStr} (visit ${visit.id})`);

          // Notify the agent
          if (lead.assigneeId) {
            await this.prisma.notification.create({
              data: {
                tenantId,
                userId: lead.assigneeId,
                type: "rule",
                title: "📅 Nueva cita agendada por IA",
                message: `La IA agendó una visita con ${lead.name ?? "sin nombre"} para el ${dateStr} a las ${timeStr}.`,
                entity: "Lead",
                entityId: leadId,
              },
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to create AI appointment for lead ${leadId}: ${err}`);
      }
    }

    return true;
  }

  /**
   * Deactivate AI conversation for a lead (e.g. when an agent sends a manual message).
   */
  async deactivateAiConversation(tenantId: string, leadId: string, reason: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        aiConversationActive: false,
        // Keep aiInstruction for history/reference
      },
    });

    await this.prisma.eventLog.create({
      data: {
        tenantId,
        type: EventType.workflow_executed,
        entity: "Lead",
        entityId: leadId,
        status: "ok",
        message: `AI conversation deactivated for lead ${leadId}: ${reason}`,
        payload: { reason } as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`AI conversation DEACTIVATED for lead ${leadId}: ${reason}`);
  }

  /**
   * Simple follow-up message generator for MVP.
   */
  private generateFollowUpMessage(instruction: string, clientName: string): string {
    const lower = instruction.toLowerCase();

    if (lower.includes("seguimiento") || lower.includes("follow")) {
      return `Hola ${clientName}, ¿cómo estás? Quería saber si sigues interesado/a en las opciones que conversamos. Estoy disponible para ayudarte en lo que necesites. ¡Saludos!`;
    }
    if (lower.includes("visita") || lower.includes("cita")) {
      return `Hola ${clientName}, ¿te gustaría agendar una visita para conocer las propiedades que tenemos disponibles? Puedo coordinar un horario que te resulte cómodo.`;
    }
    return `Hola ${clientName}, nos comunicamos desde la inmobiliaria. ${instruction}. Quedo a tu disposición para cualquier consulta.`;
  }

  // ─── Working hours helpers ──────────────────────────

  /**
   * Check if the current time falls within the rule's working hours.
   */
  isWithinWorkingHours(wh: WorkingHours): boolean {
    if (!wh.enabled || !wh.schedule || wh.schedule.length === 0) return true;

    const now = this.getNowInTimezone(wh.timezone);
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Check if any schedule entry covers the current time
    for (const entry of wh.schedule) {
      if (entry.day !== dayOfWeek) continue;
      const fromMin = this.parseTimeToMinutes(entry.from);
      const toMin = this.parseTimeToMinutes(entry.to);
      if (currentMinutes >= fromMin && currentMinutes < toMin) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate when the next working-hours window begins.
   */
  getNextWorkingWindowStart(wh: WorkingHours): Date | null {
    if (!wh.schedule || wh.schedule.length === 0) return null;

    const now = this.getNowInTimezone(wh.timezone);
    const currentDay = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Sort schedule entries by day, then by from time
    const sorted = [...wh.schedule].sort((a, b) =>
      a.day !== b.day ? a.day - b.day : this.parseTimeToMinutes(a.from) - this.parseTimeToMinutes(b.from),
    );

    // First try to find a slot later today
    for (const entry of sorted) {
      if (entry.day === currentDay) {
        const fromMin = this.parseTimeToMinutes(entry.from);
        if (fromMin > currentMinutes) {
          return this.buildDateInTimezone(wh.timezone, 0, entry.from);
        }
      }
    }

    // Then look ahead up to 7 days
    for (let offset = 1; offset <= 7; offset++) {
      const targetDay = (currentDay + offset) % 7;
      for (const entry of sorted) {
        if (entry.day === targetDay) {
          return this.buildDateInTimezone(wh.timezone, offset, entry.from);
        }
      }
    }

    return null;
  }

  private getNowInTimezone(timezone: string): Date {
    try {
      const nowStr = new Date().toLocaleString("en-US", { timeZone: timezone });
      return new Date(nowStr);
    } catch {
      // Fallback to UTC if timezone is invalid
      return new Date();
    }
  }

  private buildDateInTimezone(timezone: string, daysOffset: number, time: string): Date {
    const now = this.getNowInTimezone(timezone);
    now.setDate(now.getDate() + daysOffset);
    const [h, m] = time.split(":").map(Number);
    now.setHours(h, m, 0, 0);

    // Convert back to UTC for storage
    try {
      const utcStr = new Date().toLocaleString("en-US", { timeZone: timezone });
      const utcDate = new Date(utcStr);
      const offset = utcDate.getTime() - new Date().getTime();
      return new Date(now.getTime() - offset);
    } catch {
      return now;
    }
  }

  private parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Execute a sequence of deferred actions (called by WorkflowProcessor after a delayed job fires).
   * Handles nested waits by re-deferring remaining actions.
   */
  async executeActionSequence(
    tenantId: string,
    leadId: string,
    ruleId: string,
    ruleName: string,
    actions: RuleAction[],
  ): Promise<number> {
    let executed = 0;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        if (action.type === "wait" && action.delayMs) {
          const remaining = actions.slice(i + 1);
          if (remaining.length > 0) {
            await this.workflowQueue.add(
              "workflow.continue-actions",
              { tenantId, leadId, ruleId, ruleName, actions: remaining },
              { delay: Math.min(action.delayMs, 86_400_000) },
            );
            this.logger.debug(`Re-deferred ${remaining.length} action(s) by ${action.delayMs}ms for rule "${ruleName}"`);
          }
          executed++;
          break;
        }
        await this.executeAction(tenantId, leadId, action);
        executed++;
      } catch (err) {
        this.logger.error(`Deferred action ${action.type} failed for rule "${ruleName}": ${(err as Error).message}`);
      }
    }
    return executed;
  }
}

// ─── Types ────────────────────────────────────────────

interface RuleAction {
  type: string;
  userId?: string;
  templateKey?: string;
  value?: string;
  content?: string;
  channel?: string;
  delayMs?: number;
  goal?: string;
}
