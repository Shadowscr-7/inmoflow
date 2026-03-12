import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { MessageSenderService } from "./message-sender.service";

/**
 * FollowUpScheduler — polls active FollowUpRun records whose nextRunAt <= now,
 * sends the current step's message, and advances to the next step (or completes).
 *
 * Runs every minute.
 */
@Injectable()
export class FollowUpScheduler {
  private readonly logger = new Logger(FollowUpScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageSender: MessageSenderService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleFollowUpTick(): Promise<void> {
    const now = new Date();

    // Find active runs that are due
    const dueRuns = await this.prisma.followUpRun.findMany({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: now },
      },
      take: 100,
    });

    if (dueRuns.length === 0) return;

    this.logger.log(`Processing ${dueRuns.length} due follow-up run(s)`);

    let sent = 0;
    let completed = 0;
    let errored = 0;

    for (const run of dueRuns) {
      try {
        // Load the sequence + steps
        const sequence = await this.prisma.followUpSequence.findUnique({
          where: { id: run.sequenceId },
          include: { steps: { orderBy: { order: "asc" } } },
        });

        if (!sequence || !sequence.enabled) {
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: { status: "CANCELLED" },
          });
          continue;
        }

        // Load the lead
        const lead = await this.prisma.lead.findUnique({
          where: { id: run.leadId },
          select: {
            id: true,
            name: true,
            phone: true,
            tenantId: true,
            primaryChannel: true,
            status: true,
          },
        });

        if (!lead) {
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: { status: "CANCELLED" },
          });
          continue;
        }

        // Skip if lead was marked as LOST or WON
        if (lead.status === "LOST" || lead.status === "WON") {
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: { status: "COMPLETED", completedAt: now },
          });
          completed++;
          continue;
        }

        const steps = sequence.steps;
        const currentStep = steps[run.currentStep];

        if (!currentStep) {
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: { status: "COMPLETED", completedAt: now },
          });
          completed++;
          continue;
        }

        // Interpolate content
        const content = this.interpolate(currentStep.content, {
          name: lead.name,
          phone: lead.phone,
        });

        // Determine channel
        const channel = currentStep.channel
          ?? lead.primaryChannel
          ?? "WHATSAPP";

        // Create the message record as queued
        const msg = await this.prisma.message.create({
          data: {
            tenantId: run.tenantId,
            leadId: lead.id,
            direction: "OUT",
            channel: channel as never,
            content,
            status: "queued",
          },
        });

        // Send via MessageSenderService
        await this.messageSender.sendQueuedMessage(msg.id);
        sent++;

        // Advance to next step
        const nextStepIdx = run.currentStep + 1;
        const nextStep = steps[nextStepIdx];

        if (nextStep) {
          const nextRunAt = new Date(Date.now() + nextStep.delayHours * 3600000);
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: { currentStep: nextStepIdx, nextRunAt },
          });
        } else {
          // That was the last step — completed
          await this.prisma.followUpRun.update({
            where: { id: run.id },
            data: {
              currentStep: nextStepIdx,
              status: "COMPLETED",
              completedAt: now,
              nextRunAt: null,
            },
          });
          completed++;
        }
      } catch (err) {
        errored++;
        this.logger.error(
          `Follow-up run ${run.id} failed: ${(err as Error).message}`,
        );
        // Don't stop other runs — continue processing
      }
    }

    this.logger.log(
      `Follow-up tick: ${sent} sent, ${completed} completed, ${errored} errors`,
    );
  }

  private interpolate(template: string, lead: { name?: string | null; phone?: string | null }): string {
    return template
      .replace(/\{\{nombre\}\}/gi, lead.name || "")
      .replace(/\{\{telefono\}\}/gi, lead.phone || "")
      .replace(/\{\{name\}\}/gi, lead.name || "")
      .replace(/\{\{phone\}\}/gi, lead.phone || "");
  }
}
