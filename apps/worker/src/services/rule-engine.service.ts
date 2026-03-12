import { Injectable, Logger } from "@nestjs/common";
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
  goal?: string;
}
