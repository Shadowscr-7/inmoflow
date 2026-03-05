import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RuleEngineService } from "../services/rule-engine.service";

@Processor("lead")
export class LeadProcessor extends WorkerHost {
  private readonly logger = new Logger(LeadProcessor.name);

  constructor(private readonly ruleEngine: RuleEngineService) {
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
}
