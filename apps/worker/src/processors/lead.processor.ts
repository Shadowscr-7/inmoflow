import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RuleEngineService } from "../services/rule-engine.service";
import { LeadScoringService } from "../services/lead-scoring.service";

@Processor("lead")
export class LeadProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadProcessor.name);

  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly scoring: LeadScoringService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(
      `Processing job ${job.name} [${job.id}] — tenant: ${job.data?.tenantId}`,
    );

    switch (job.name) {
      case "lead.created":
        await this.handleLeadCreated(job.data);
        break;
      case "lead.updated":
        await this.handleLeadUpdated(job.data);
        break;
      case "lead.assigned":
        await this.handleLeadAssigned(job.data);
        break;
      case "lead.contacted":
        await this.handleLeadContacted(job.data);
        break;
      case "stage.changed":
        await this.handleStageChanged(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleLeadCreated(data: Record<string, unknown>) {
    const { tenantId, leadId, ...context } = data;
    this.logger.log(`Lead created: ${leadId} (tenant: ${tenantId})`);

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "lead.created",
      leadId as string,
      context,
    );

    this.logger.log(
      `Rules evaluated: ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );

    await this.autoScore(tenantId as string, leadId as string);
  }

  private async handleLeadUpdated(data: Record<string, unknown>) {
    const { tenantId, leadId, changes, ...context } = data;
    this.logger.log(`Lead updated: ${leadId} (tenant: ${tenantId})`);

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "lead.updated",
      leadId as string,
      { ...context, ...(changes as Record<string, unknown>) },
    );

    this.logger.log(
      `Rules evaluated: ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );

    // Also fire stage.changed if the stage was updated
    const ch = changes as Record<string, unknown> | undefined;
    if (ch?.stageId || ch?.stageKey) {
      const stageResult = await this.ruleEngine.evaluate(
        tenantId as string,
        "stage.changed",
        leadId as string,
        { ...context, ...(ch ?? {}) },
      );

      if (stageResult.rulesMatched > 0) {
        this.logger.log(
          `stage.changed rules: ${stageResult.rulesMatched} matched, ${stageResult.actionsExecuted} actions`,
        );
      }
    }

    await this.autoScore(tenantId as string, leadId as string);
  }

  private async handleStageChanged(data: Record<string, unknown>) {
    const { tenantId, leadId, ...context } = data;
    this.logger.log(`Stage changed: lead ${leadId} (tenant: ${tenantId})`);

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "stage.changed",
      leadId as string,
      context,
    );

    this.logger.log(
      `stage.changed rules: ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );
  }

  private async handleLeadAssigned(data: Record<string, unknown>) {
    const { tenantId, leadId, assigneeId, previousAssigneeId, ...context } = data;
    this.logger.log(
      `Lead assigned: ${leadId} → ${assigneeId}${previousAssigneeId ? ` (was: ${previousAssigneeId})` : ""} (tenant: ${tenantId})`,
    );

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "lead.assigned",
      leadId as string,
      { ...context, assigneeId, previousAssigneeId },
    );

    this.logger.log(
      `lead.assigned rules: ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );
  }

  private async handleLeadContacted(data: Record<string, unknown>) {
    const { tenantId, leadId, messageId, channel, ...context } = data;
    this.logger.log(
      `Lead contacted (first reply): ${leadId} via ${channel} (tenant: ${tenantId})`,
    );

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "lead.contacted",
      leadId as string,
      { ...context, messageId, channel },
    );

    this.logger.log(
      `lead.contacted rules: ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );

    await this.autoScore(tenantId as string, leadId as string);
  }

  /** Re-score lead after every significant event */
  private async autoScore(tenantId: string, leadId: string): Promise<void> {
    try {
      await this.scoring.scoreLead(leadId, tenantId);
    } catch (err) {
      this.logger.warn(`Auto-score failed for lead ${leadId}: ${(err as Error).message}`);
    }
  }
}
