import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RuleEngineService } from "./rule-engine.service";

/**
 * QueueDrainScheduler — Processes queued automation actions that were
 * deferred because they arrived outside the rule's configured working hours.
 *
 * Runs every 5 minutes. Groups pending items by assignee (agent) so that:
 *  • Each agent's items are processed sequentially with 60-180 s pauses
 *    (to avoid WhatsApp per-number rate-limit bans).
 *  • Different agents are processed in parallel since each uses a
 *    different WhatsApp number.
 *  • Unassigned leads (assigneeId = null) are treated as a separate group.
 *
 * Retries up to 2 times before marking as failed.
 */
@Injectable()
export class QueueDrainScheduler {
  private readonly logger = new Logger(QueueDrainScheduler.name);

  /** Minimum pause between queued items of the SAME agent (ms) */
  private readonly MIN_PAUSE_MS = 60_000; // 1 min
  /** Maximum pause between queued items of the SAME agent (ms) */
  private readonly MAX_PAUSE_MS = 180_000; // 3 min
  /** Max items to fetch per cycle (across all agents) */
  private readonly BATCH_SIZE = 50;
  /** Max items per agent per cycle */
  private readonly PER_AGENT_LIMIT = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async drainQueue(): Promise<void> {
    this.logger.log("Queue drain: checking for pending queued actions…");

    try {
      const now = new Date();

      // Fetch all ready items in one query
      const items = await this.prisma.queuedAction.findMany({
        where: {
          status: "pending",
          OR: [
            { processAt: { lte: now } },
            { processAt: null },
          ],
        },
        include: {
          rule: true,
        },
        orderBy: [{ processAt: "asc" }, { createdAt: "asc" }],
        take: this.BATCH_SIZE,
      });

      if (items.length === 0) {
        this.logger.debug("No pending queued actions");
        return;
      }

      // ── Group items by assigneeId ──────────────────────
      // Each group = one WhatsApp number = sequential processing with pauses.
      // Key: assigneeId or "__unassigned__" for leads without an agent.
      const byAgent = new Map<string, typeof items>();

      for (const item of items) {
        const agentKey = item.assigneeId ?? "__unassigned__";
        const group = byAgent.get(agentKey) ?? [];
        if (group.length < this.PER_AGENT_LIMIT) {
          group.push(item);
        }
        byAgent.set(agentKey, group);
      }

      this.logger.log(
        `Processing ${items.length} queued action(s) across ${byAgent.size} agent group(s)…`,
      );

      // ── Process each agent's queue in parallel ─────────
      // Different agents use different WhatsApp numbers, so no cross-rate-limit risk.
      const results = await Promise.allSettled(
        Array.from(byAgent.entries()).map(([agentKey, agentItems]) =>
          this.processAgentQueue(agentKey, agentItems),
        ),
      );

      // Aggregate stats
      let totalProcessed = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          totalProcessed += result.value.processed;
          totalFailed += result.value.failed;
          totalSkipped += result.value.skipped;
        } else {
          this.logger.error(`Agent queue failed: ${result.reason}`);
        }
      }

      this.logger.log(
        `Queue drain complete: ${totalProcessed} processed, ${totalFailed} failed, ${totalSkipped} skipped/rescheduled (${byAgent.size} agents)`,
      );
    } catch (err) {
      this.logger.error(`Queue drain failed: ${(err as Error).message}`);
    }
  }

  /**
   * Process a single agent's queued items sequentially, with randomized
   * pauses between each to avoid WhatsApp rate limits on that number.
   */
  private async processAgentQueue(
    agentKey: string,
    items: Array<{
      id: string;
      tenantId: string;
      ruleId: string;
      leadId: string;
      assigneeId: string | null;
      attempts: number;
      rule: { id: string; name: string; enabled: boolean; workingHours: unknown } | null;
    }>,
  ): Promise<{ processed: number; failed: number; skipped: number }> {
    const agentLabel = agentKey === "__unassigned__" ? "unassigned" : agentKey.slice(0, 8);
    this.logger.log(`Agent [${agentLabel}]: processing ${items.length} item(s)…`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Re-check that the rule still exists and is enabled
      if (!item.rule || !item.rule.enabled) {
        await this.prisma.queuedAction.update({
          where: { id: item.id },
          data: { status: "cancelled", error: "Rule disabled or deleted" },
        });
        skipped++;
        continue;
      }

      // Verify working hours are currently active for this rule
      const wh = item.rule.workingHours as unknown as {
        enabled: boolean;
        timezone: string;
        schedule: { day: number; from: string; to: string }[];
      } | null;

      if (wh && wh.enabled && !this.ruleEngine.isWithinWorkingHours(wh)) {
        // Not yet in working hours, recalculate processAt
        const nextWindow = this.ruleEngine.getNextWorkingWindowStart(wh);
        await this.prisma.queuedAction.update({
          where: { id: item.id },
          data: { processAt: nextWindow },
        });
        this.logger.debug(
          `Agent [${agentLabel}] action ${item.id} — still outside working hours, rescheduled to ${nextWindow?.toISOString()}`,
        );
        skipped++;
        continue;
      }

      // ── Execute the rule for this specific lead ──────
      try {
        await this.prisma.queuedAction.update({
          where: { id: item.id },
          data: { status: "processing", attempts: { increment: 1 } },
        });

        await this.ruleEngine.executeSingleRule(
          item.tenantId,
          item.ruleId,
          item.leadId,
        );

        await this.prisma.queuedAction.update({
          where: { id: item.id },
          data: { status: "completed" },
        });

        processed++;
        this.logger.log(
          `Agent [${agentLabel}] action ${item.id} completed (rule: "${item.rule.name}", lead: ${item.leadId})`,
        );
      } catch (err) {
        failed++;
        const errMsg = (err as Error).message;

        await this.prisma.queuedAction.update({
          where: { id: item.id },
          data: {
            status: item.attempts >= 2 ? "failed" : "pending",
            error: errMsg,
            // If still retryable, push to next cycle
            processAt: item.attempts < 2 ? new Date(Date.now() + 300_000) : undefined,
          },
        });

        this.logger.error(
          `Agent [${agentLabel}] action ${item.id} failed (attempt ${item.attempts + 1}): ${errMsg}`,
        );
      }

      // ── Per-agent pause to avoid WhatsApp ban on this number ──
      // Only pause between consecutive items for the SAME agent.
      if (i < items.length - 1) {
        const pause =
          this.MIN_PAUSE_MS +
          Math.random() * (this.MAX_PAUSE_MS - this.MIN_PAUSE_MS);
        this.logger.debug(
          `Agent [${agentLabel}] pausing ${Math.round(pause / 1000)}s before next item…`,
        );
        await this.sleep(pause);
      }
    }

    this.logger.log(
      `Agent [${agentLabel}] done: ${processed} processed, ${failed} failed, ${skipped} skipped`,
    );

    return { processed, failed, skipped };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
