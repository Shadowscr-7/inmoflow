import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

/**
 * EventProducerService enqueues jobs to BullMQ for async processing by the Worker.
 *
 * Queues:
 * - lead: lead.created, lead.updated
 * - message: message.inbound, message.send_requested
 * - workflow: workflow.execute (direct rule execution)
 */
@Injectable()
export class EventProducerService {
  private readonly logger = new Logger(EventProducerService.name);

  constructor(
    @InjectQueue("lead") private readonly leadQueue: Queue,
    @InjectQueue("message") private readonly messageQueue: Queue,
    @InjectQueue("workflow") private readonly workflowQueue: Queue,
  ) {}

  /**
   * Enqueue a lead event for the worker to process (run matching rules).
   */
  async emitLeadCreated(tenantId: string, leadId: string, meta?: Record<string, unknown>) {
    const job = await this.leadQueue.add(
      "lead.created",
      { tenantId, leadId, ...meta },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    this.logger.debug(`Enqueued lead.created [${job.id}] lead=${leadId}`);
  }

  async emitLeadUpdated(
    tenantId: string,
    leadId: string,
    changes: Record<string, unknown>,
  ) {
    const job = await this.leadQueue.add(
      "lead.updated",
      { tenantId, leadId, changes },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    this.logger.debug(`Enqueued lead.updated [${job.id}] lead=${leadId}`);
  }

  /**
   * Enqueue a lead.assigned event — fires when a lead is assigned (or reassigned) to a user.
   */
  async emitLeadAssigned(
    tenantId: string,
    leadId: string,
    assigneeId: string,
    previousAssigneeId?: string | null,
  ) {
    const job = await this.leadQueue.add(
      "lead.assigned",
      { tenantId, leadId, assigneeId, previousAssigneeId },
      {
        jobId: `lead.assigned:${leadId}:${assigneeId}:${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    this.logger.debug(`Enqueued lead.assigned [${job.id}] lead=${leadId} → user=${assigneeId}`);
  }

  /**
   * Enqueue a lead.contacted event — fires when the client responds for the first time.
   */
  async emitLeadContacted(
    tenantId: string,
    leadId: string,
    messageId: string,
    channel: string,
  ) {
    const job = await this.leadQueue.add(
      "lead.contacted",
      { tenantId, leadId, messageId, channel },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    this.logger.debug(`Enqueued lead.contacted [${job.id}] lead=${leadId}`);
  }

  async emitMessageInbound(
    tenantId: string,
    leadId: string,
    messageId: string,
    channel: string,
    content?: string,
  ) {
    const job = await this.messageQueue.add(
      "message.inbound",
      { tenantId, leadId, messageId, channel, content: content ?? "" },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    this.logger.debug(`Enqueued message.inbound [${job.id}] msg=${messageId}`);
  }

  /**
   * Directly execute a workflow (for manual trigger from UI or testing).
   */
  async emitWorkflowExecute(
    tenantId: string,
    ruleId: string,
    leadId: string,
    context?: Record<string, unknown>,
  ) {
    const job = await this.workflowQueue.add(
      "workflow.execute",
      { tenantId, ruleId, leadId, context },
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    );
    this.logger.debug(`Enqueued workflow.execute [${job.id}] rule=${ruleId}`);
  }
}
