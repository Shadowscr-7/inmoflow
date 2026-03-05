import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RuleEngineService } from "./rule-engine.service";

/**
 * NoResponseScheduler — Cron job that detects leads with no inbound
 * message for a configurable number of days and fires the `no_response`
 * trigger so rules can act (e.g., send follow-up, notify agent).
 *
 * Runs every hour. For each tenant that has enabled rules with
 * trigger = "no_response", checks leads whose last inbound message
 * is older than the threshold defined in the rule conditions.
 */
@Injectable()
export class NoResponseScheduler {
  private readonly logger = new Logger(NoResponseScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleNoResponseCheck(): Promise<void> {
    this.logger.log("Running no_response check…");

    try {
      // Find all tenants with enabled no_response rules
      const rules = await this.prisma.rule.findMany({
        where: { trigger: "no_response", enabled: true },
      });

      if (rules.length === 0) {
        this.logger.debug("No no_response rules found");
        return;
      }

      // Group rules by tenant
      const rulesByTenant = new Map<string, typeof rules>();
      for (const rule of rules) {
        const existing = rulesByTenant.get(rule.tenantId) ?? [];
        existing.push(rule);
        rulesByTenant.set(rule.tenantId, existing);
      }

      let totalLeadsChecked = 0;
      let totalTriggered = 0;

      for (const [tenantId, tenantRules] of rulesByTenant) {
        // Default: 3 days without response
        const maxDays = this.getMaxDaysFromRules(tenantRules);
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - maxDays);

        // Find leads that are still active and whose last inbound
        // message is older than the threshold (or have no inbound messages)
        const leads = await this.prisma.lead.findMany({
          where: {
            tenantId,
            status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
            messages: {
              none: {
                direction: "IN",
                createdAt: { gte: threshold },
              },
            },
            // Must have at least one outbound message (we reached out)
            AND: {
              messages: {
                some: {
                  direction: "OUT",
                },
              },
            },
          },
          select: { id: true },
          take: 200, // Process in batches to avoid overload
        });

        totalLeadsChecked += leads.length;

        for (const lead of leads) {
          const result = await this.ruleEngine.evaluate(
            tenantId,
            "no_response",
            lead.id,
            { daysSinceLastResponse: maxDays },
          );

          if (result.rulesMatched > 0) totalTriggered++;
        }
      }

      this.logger.log(
        `no_response check complete: ${totalLeadsChecked} leads checked, ${totalTriggered} triggered`,
      );
    } catch (err) {
      this.logger.error(`no_response check failed: ${(err as Error).message}`);
    }
  }

  /**
   * Extract the maximum "days" threshold from rule conditions.
   * Looks for conditions like { daysSinceLastResponse: { op: "gte", value: 3 } }
   * or a simple { days: 5 }. Defaults to 3 days.
   */
  private getMaxDaysFromRules(rules: { conditions: unknown }[]): number {
    let minDays = 3;

    for (const rule of rules) {
      const cond = rule.conditions as Record<string, unknown> | null;
      if (!cond) continue;

      const daysVal =
        (cond.days as number) ??
        (cond.daysSinceLastResponse as number) ??
        ((cond.daysSinceLastResponse as { value?: number })?.value);

      if (typeof daysVal === "number" && daysVal > 0 && daysVal < minDays) {
        minDays = daysVal;
      }
    }

    return minDays;
  }
}
