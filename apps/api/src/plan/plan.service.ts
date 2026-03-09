import { Injectable, ForbiddenException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Plan } from "@inmoflow/db";

export interface PlanLimits {
  maxUsers: number;       // -1 = unlimited
  maxRules: number;       // -1 = unlimited
  maxChannels: number;    // -1 = unlimited
  allowedChannels: string[]; // e.g. ["WHATSAPP", "WEB"] or ["ALL"]
  aiEnabled: boolean;
  metaLeads: boolean;
}

/**
 * Plan configuration — defined in-code for simplicity.
 * For multi-tenant SaaS with custom pricing, move these limits to a `plan_config`
 * table per tenant, or use JSON overrides on the Tenant model.
 *
 * To override limits for a specific plan via environment (JSON):
 *   PLAN_OVERRIDE_STARTER='{"maxUsers":5,"maxRules":10}'
 */
function loadPlanConfig(): Record<Plan, PlanLimits> {
  const base: Record<Plan, PlanLimits> = {
    [Plan.STARTER]: {
      maxUsers: 3,
      maxRules: 5,
      maxChannels: 2,
      allowedChannels: ["WHATSAPP", "WEB"],
      aiEnabled: false,
      metaLeads: false,
    },
    [Plan.PROFESSIONAL]: {
      maxUsers: 10,
      maxRules: -1,
      maxChannels: -1,
      allowedChannels: ["ALL"],
      aiEnabled: true,
      metaLeads: true,
    },
    [Plan.CUSTOM]: {
      maxUsers: -1,
      maxRules: -1,
      maxChannels: -1,
      allowedChannels: ["ALL"],
      aiEnabled: true,
      metaLeads: true,
    },
  };

  // Allow env-based overrides per plan
  for (const plan of Object.values(Plan)) {
    const envKey = `PLAN_OVERRIDE_${plan}`;
    const raw = process.env[envKey];
    if (raw) {
      try {
        const overrides = JSON.parse(raw);
        base[plan] = { ...base[plan], ...overrides };
      } catch {
        // ignore malformed JSON
      }
    }
  }

  return base;
}

const PLAN_CONFIG = loadPlanConfig();

const PLAN_LABELS: Record<Plan, string> = {
  [Plan.STARTER]: "Starter",
  [Plan.PROFESSIONAL]: "Profesional",
  [Plan.CUSTOM]: "Custom",
};

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get limits for a given plan */
  getLimits(plan: Plan): PlanLimits {
    return PLAN_CONFIG[plan] ?? PLAN_CONFIG[Plan.STARTER];
  }

  /** Get all available plans with their limits (for comparison UI) */
  getAvailablePlans(): { plan: Plan; label: string; limits: PlanLimits }[] {
    return Object.values(Plan).map((plan) => ({
      plan,
      label: PLAN_LABELS[plan],
      limits: this.getLimits(plan),
    }));
  }

  /** Get the tenant's current plan */
  async getTenantPlan(tenantId: string): Promise<Plan> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    return (tenant?.plan as Plan) ?? Plan.STARTER;
  }

  /** Get limits for a specific tenant */
  async getTenantLimits(tenantId: string): Promise<PlanLimits & { plan: Plan; planLabel: string }> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);
    return { ...limits, plan, planLabel: PLAN_LABELS[plan] };
  }

  /** Check if tenant can create more users. Throws ForbiddenException if at limit. */
  async checkUserLimit(tenantId: string): Promise<void> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);
    if (limits.maxUsers === -1) return;

    const count = await this.prisma.user.count({
      where: { tenantId, isActive: true },
    });

    if (count >= limits.maxUsers) {
      throw new ForbiddenException(
        `Tu plan ${PLAN_LABELS[plan]} permite hasta ${limits.maxUsers} usuarios. Actualizá a un plan superior para agregar más.`,
      );
    }
  }

  /** Check if tenant can create more rules. Throws ForbiddenException if at limit. */
  async checkRuleLimit(tenantId: string): Promise<void> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);
    if (limits.maxRules === -1) return;

    const count = await this.prisma.rule.count({
      where: { tenantId },
    });

    if (count >= limits.maxRules) {
      throw new ForbiddenException(
        `Tu plan ${PLAN_LABELS[plan]} permite hasta ${limits.maxRules} automatizaciones. Actualizá a un plan superior.`,
      );
    }
  }

  /** Check if tenant can use AI features. Throws ForbiddenException if not allowed. */
  async checkAiAccess(tenantId: string): Promise<void> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);

    if (!limits.aiEnabled) {
      throw new ForbiddenException(
        `El Agente IA no está disponible en tu plan ${PLAN_LABELS[plan]}. Actualizá al plan Profesional para activarlo.`,
      );
    }
  }

  /** Check if tenant can use a specific channel type. */
  async checkChannelAccess(tenantId: string, channelType: string): Promise<void> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);

    if (limits.allowedChannels.includes("ALL")) return;

    if (!limits.allowedChannels.includes(channelType)) {
      throw new ForbiddenException(
        `El canal ${channelType} no está disponible en tu plan ${PLAN_LABELS[plan]}. Actualizá a un plan superior.`,
      );
    }
  }

  /** Check if tenant can use Meta Lead Ads. */
  async checkMetaLeadsAccess(tenantId: string): Promise<void> {
    const plan = await this.getTenantPlan(tenantId);
    const limits = this.getLimits(plan);

    if (!limits.metaLeads) {
      throw new ForbiddenException(
        `Meta Lead Ads no está disponible en tu plan ${PLAN_LABELS[plan]}. Actualizá al plan Profesional.`,
      );
    }
  }
}
