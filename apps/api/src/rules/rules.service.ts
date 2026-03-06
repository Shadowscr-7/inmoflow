import { Injectable, NotFoundException, ConflictException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EventType, Prisma } from "@inmoflow/db";
import { PlanService } from "../plan/plan.service";

export interface CreateRuleDto {
  name: string;
  trigger: string; // "lead.created" | "lead.updated" | "message.inbound" | "stage.changed" | "no_response" | "scheduled"
  priority?: number;
  conditions: Record<string, unknown>; // visual builder produces this
  actions: RuleAction[]; // [{ type: "assign", ... }, { type: "send_template", ... }]
  enabled?: boolean;
}

export interface UpdateRuleDto {
  name?: string;
  trigger?: string;
  priority?: number;
  conditions?: Record<string, unknown>;
  actions?: RuleAction[];
  enabled?: boolean;
  global?: boolean;
}

export interface RuleAction {
  type: string;
  /** assign: userId or "round_robin" */
  userId?: string;
  /** send_template: template key */
  templateKey?: string;
  /** change_status / change_stage: target value */
  value?: string;
  /** add_note / notify / send_ai_message: text content */
  content?: string;
  /** send_template / send_ai_message: channel override */
  channel?: string;
  /** delay in ms before executing this action (or wait duration) */
  delayMs?: number;
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly planService: PlanService,
  ) {}

  /** All rules for a tenant (admin view) — includes user relation */
  async findAll(tenantId: string, filters?: { trigger?: string; enabled?: boolean }) {
    if (!tenantId) return [];

    const where: Prisma.RuleWhereInput = { tenantId };
    if (filters?.trigger) where.trigger = filters.trigger;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;

    return this.prisma.rule.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Rules visible to a specific user: own + global (userId == null) */
  async findForUser(
    tenantId: string,
    userId: string,
    filters?: { trigger?: string; enabled?: boolean },
  ) {
    if (!tenantId) return [];

    const where: Prisma.RuleWhereInput = {
      tenantId,
      OR: [{ userId }, { userId: null }],
    };
    if (filters?.trigger) where.trigger = filters.trigger;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;

    return this.prisma.rule.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
  }

  async findById(tenantId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({
      where: { id, tenantId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    return rule;
  }

  async create(tenantId: string, dto: CreateRuleDto, userId?: string) {
    // Check plan rule limit
    await this.planService.checkRuleLimit(tenantId);

    const rule = await this.prisma.rule.create({
      data: {
        tenantId,
        userId: userId ?? null,
        name: dto.name,
        trigger: dto.trigger,
        priority: dto.priority ?? 100,
        conditions: dto.conditions as Prisma.InputJsonValue,
        actions: dto.actions as unknown as Prisma.InputJsonValue,
        enabled: dto.enabled ?? true,
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.rule_created,
      entity: "Rule",
      entityId: rule.id,
      message: `Rule created: ${rule.name} (trigger: ${rule.trigger})`,
    });

    return rule;
  }

  async update(tenantId: string, id: string, dto: UpdateRuleDto, userId?: string, userRole?: string) {
    const existing = await this.findById(tenantId, id);

    let userIdUpdate: string | null | undefined = undefined;
    if (dto.global !== undefined && userId && ["BUSINESS", "ADMIN"].includes(userRole ?? "")) {
      userIdUpdate = dto.global ? null : userId;
    }

    const rule = await this.prisma.rule.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.trigger !== undefined && { trigger: dto.trigger }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.conditions !== undefined && {
          conditions: dto.conditions as Prisma.InputJsonValue,
        }),
        ...(dto.actions !== undefined && {
          actions: dto.actions as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(userIdUpdate !== undefined && { userId: userIdUpdate }),
      },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.rule_updated,
      entity: "Rule",
      entityId: rule.id,
      message: `Rule updated: ${rule.name}`,
    });

    return rule;
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.prisma.rule.delete({ where: { id: existing.id } });

    await this.eventLog.log({
      tenantId,
      type: EventType.rule_deleted,
      entity: "Rule",
      entityId: id,
      message: `Rule deleted: ${existing.name}`,
    });
  }

  /**
   * Find all enabled rules that match a given trigger, ordered by priority.
   * Returns global rules + rules belonging to the specified user (or all if no userId).
   */
  async findMatchingRules(tenantId: string, trigger: string, userId?: string) {
    const where: Prisma.RuleWhereInput = { tenantId, trigger, enabled: true };
    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }
    return this.prisma.rule.findMany({
      where,
      orderBy: { priority: "asc" },
    });
  }

  /**
   * Evaluate if a rule's conditions match the given context.
   * Conditions is a JSON object where each key-value must match the context.
   */
  evaluateConditions(
    conditions: Record<string, unknown>,
    context: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (value === undefined || value === null) continue;

      const contextValue = context[key];

      // Array means "any of"
      if (Array.isArray(value)) {
        if (!value.includes(contextValue)) return false;
      } else if (contextValue !== value) {
        return false;
      }
    }
    return true;
  }
}
