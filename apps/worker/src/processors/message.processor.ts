import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RuleEngineService } from "../services/rule-engine.service";

@Processor("message")
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(private readonly ruleEngine: RuleEngineService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(
      `Processing job ${job.name} [${job.id}] — tenant: ${job.data?.tenantId}`,
    );

    switch (job.name) {
      case "message.inbound":
        await this.handleMessageInbound(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleMessageInbound(data: Record<string, unknown>) {
    const { tenantId, leadId, messageId, channel, content, ...context } = data;
    this.logger.log(
      `Message inbound: ${messageId} → lead ${leadId} (${channel})`,
    );

    // ── AI auto-reply: if the lead has an active AI conversation, reply first ──
    // This runs BEFORE rules so the AI answers immediately.
    // Rules still fire afterwards (e.g. for notifications, stage changes, etc.)
    const inboundText = (content as string) ?? "";
    if (inboundText) {
      try {
        const replied = await this.ruleEngine.handleAiAutoReply(
          tenantId as string,
          leadId as string,
          inboundText,
        );
        if (replied) {
          this.logger.log(`AI auto-reply sent for lead ${leadId}`);
        }
      } catch (err) {
        this.logger.error(`AI auto-reply failed for lead ${leadId}: ${(err as Error).message}`);
      }
    }

    const result = await this.ruleEngine.evaluate(
      tenantId as string,
      "message.inbound",
      leadId as string,
      { ...context, channel, messageId },
    );

    this.logger.log(
      `Rules evaluated (message.inbound): ${result.rulesMatched} matched, ${result.actionsExecuted} actions`,
    );
  }
}
