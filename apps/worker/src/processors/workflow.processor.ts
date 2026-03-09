import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RuleEngineService } from "../services/rule-engine.service";

/**
 * WorkflowProcessor — handles direct workflow execution requests.
 * Used when a specific rule needs to be executed on demand (e.g., from UI "Run Now").
 */
@Processor("workflow")
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(private readonly ruleEngine: RuleEngineService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(
      `Processing job ${job.name} [${job.id}] — tenant: ${job.data?.tenantId}`,
    );

    switch (job.name) {
      case "workflow.execute":
        await this.handleWorkflowExecute(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleWorkflowExecute(data: Record<string, unknown>) {
    const { tenantId, ruleId, leadId } = data;
    this.logger.log(
      `Manual workflow execute: rule=${ruleId} lead=${leadId}`,
    );

    if (ruleId && leadId) {
      // Execute a specific rule on a specific lead
      const result = await this.ruleEngine.executeSingleRule(
        tenantId as string,
        ruleId as string,
        leadId as string,
      );
      this.logger.log(`Workflow result: ${result.actionsExecuted} actions executed`);
    } else if (leadId) {
      // No specific rule — evaluate all workflow.execute rules for the lead
      const result = await this.ruleEngine.evaluate(
        tenantId as string,
        "workflow.execute",
        leadId as string,
      );
      this.logger.log(
        `Workflow result: ${result.rulesMatched} rules, ${result.actionsExecuted} actions`,
      );
    } else {
      this.logger.warn("workflow.execute job missing leadId");
    }
  }
}
