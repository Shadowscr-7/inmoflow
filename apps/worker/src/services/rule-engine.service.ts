import { Injectable, Logger } from "@nestjs/common";
import { EventType, Prisma, MessageChannel, LeadStatus } from "@inmoflow/db";
import { PrismaService } from "../prisma/prisma.service";
import { AiAgentService } from "./ai-agent.service";
import { MessageSenderService } from "./message-sender.service";

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
    const ruleWhere: Prisma.RuleWhereInput = {
      tenantId,
      trigger,
      enabled: true,
      OR: lead.assigneeId
        ? [{ userId: null }, { userId: lead.assigneeId }]
        : [{ userId: null }],
    };

    const rules = await this.prisma.rule.findMany({
      where: ruleWhere,
      orderBy: { priority: "asc" },
    });

    if (rules.length === 0) return { rulesMatched: 0, actionsExecuted: 0 };

    // Build evaluation context
    const evalContext: Record<string, unknown> = {
      ...context,
      status: lead.status,
      stageKey: lead.stage?.key,
      sourceType: lead.source?.type,
      sourceName: lead.source?.name,
      hasPhone: !!lead.phone,
      hasEmail: !!lead.email,
      intent: lead.intent,
      primaryChannel: lead.primaryChannel,
      assigneeId: lead.assigneeId,
      hasAssignee: !!lead.assigneeId,
    };

    let rulesMatched = 0;
    let actionsExecuted = 0;

    for (const rule of rules) {
      const conditions = (rule.conditions as Record<string, unknown>) ?? {};

      if (!this.evaluateConditions(conditions, evalContext)) {
        continue;
      }

      rulesMatched++;
      this.logger.log(`Rule matched: "${rule.name}" (${rule.id}) for lead ${leadId}`);

      const actions = (rule.actions as unknown as RuleAction[]) ?? [];

      for (const action of actions) {
        try {
          // Handle wait/delay actions
          if (action.type === "wait" && action.delayMs) {
            const MAX_IN_PROCESS_WAIT = 300_000; // 5 minutes max
            if (action.delayMs > MAX_IN_PROCESS_WAIT) {
              this.logger.warn(`Wait action ${action.delayMs}ms exceeds max ${MAX_IN_PROCESS_WAIT}ms — capping. Use scheduled jobs for longer delays.`);
            }
            const waitMs = Math.min(action.delayMs, MAX_IN_PROCESS_WAIT);
            this.logger.debug(`Waiting ${waitMs}ms before next action`);
            await this.sleep(waitMs);
            actionsExecuted++;
            continue;
          }

          await this.executeAction(tenantId, leadId, action);
          actionsExecuted++;
        } catch (err) {
          this.logger.error(
            `Action ${action.type} failed for rule "${rule.name}": ${(err as Error).message}`,
          );

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
        }
      }

      // Log successful workflow execution
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
    }

    return { rulesMatched, actionsExecuted };
  }

  /** Execute a single rule by ID (for manual "Run Now" from UI) */
  async executeSingleRule(
    tenantId: string,
    ruleId: string,
    leadId: string,
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

    for (const action of actions) {
      try {
        if (action.type === "wait" && action.delayMs) {
          await this.sleep(Math.min(action.delayMs, 300_000));
          actionsExecuted++;
          continue;
        }
        await this.executeAction(tenantId, leadId, action);
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
      if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        const cond = value as { op?: string; value?: unknown };
        if (cond.op && cond.value !== undefined) {
          const numCtx = Number(ctxVal);
          const numVal = Number(cond.value);
          switch (cond.op) {
            case "eq": if (ctxVal !== cond.value) return false; break;
            case "neq": if (ctxVal === cond.value) return false; break;
            case "gt": if (numCtx <= numVal) return false; break;
            case "gte": if (numCtx < numVal) return false; break;
            case "lt": if (numCtx >= numVal) return false; break;
            case "lte": if (numCtx > numVal) return false; break;
            case "contains":
              if (typeof ctxVal !== "string" || !ctxVal.toLowerCase().includes(String(cond.value).toLowerCase())) return false;
              break;
            default: break;
          }
          continue;
        }
      }

      if (Array.isArray(value)) {
        if (!value.includes(ctxVal)) return false;
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
  ): Promise<void> {
    switch (action.type) {
      case "assign":
        await this.actionAssign(tenantId, leadId, action);
        break;
      case "send_template":
        await this.actionSendTemplate(tenantId, leadId, action);
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

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assigneeId: userId },
    });

    this.logger.debug(`Assigned lead ${leadId} to user ${userId}`);
  }

  private async actionSendTemplate(tenantId: string, leadId: string, action: RuleAction) {
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
      propiedad: lead.intent ?? "",
      notas: lead.notes ?? "",
      notes: lead.notes ?? "",
    };

    const rendered = template.content.replace(
      /\{\{(\w+)\}\}/g,
      (_match: string, key: string) => variables[key] ?? `{{${key}}}`,
    );

    // Save as an outbound message — then attempt to actually send it.
    const msg = await this.prisma.message.create({
      data: {
        tenantId,
        leadId,
        direction: "OUT",
        channel: ((template.channel as string) ?? lead.primaryChannel ?? "WEB") as MessageChannel,
        content: rendered,
        status: "queued",
      },
    });

    // Attempt delivery through the correct channel
    await this.messageSender.sendQueuedMessage(msg.id);

    this.logger.debug(`Template "${action.templateKey}" sent for lead ${leadId}`);
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
   * Falls back to template-based generation if no AI provider is configured.
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
}
