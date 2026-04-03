import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

/**
 * StuckChannelScheduler — Resets WhatsApp channels that have been stuck
 * in CONNECTING state for more than 15 minutes.
 *
 * This happens when a user initiates the QR pairing flow but never scans
 * the QR code, leaving their channel in a permanent "Conectando" state.
 *
 * Runs every 10 minutes. Marks stuck channels as DISCONNECTED so the user
 * can start the pairing flow from scratch.
 */
@Injectable()
export class StuckChannelScheduler {
  private readonly logger = new Logger(StuckChannelScheduler.name);
  private readonly STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStuckChannels(): Promise<void> {
    const cutoff = new Date(Date.now() - this.STUCK_THRESHOLD_MS);

    try {
      const stuckChannels = await this.prisma.channel.findMany({
        where: {
          status: "CONNECTING",
          updatedAt: { lt: cutoff },
        },
        select: { id: true, tenantId: true, userId: true, type: true },
      });

      if (stuckChannels.length === 0) return;

      this.logger.log(`Resetting ${stuckChannels.length} channel(s) stuck in CONNECTING`);

      await this.prisma.channel.updateMany({
        where: { id: { in: stuckChannels.map((c) => c.id) } },
        data: { status: "DISCONNECTED" },
      });

      for (const ch of stuckChannels) {
        this.logger.log(`Channel ${ch.id} (${ch.type}, user ${ch.userId}) reset to DISCONNECTED`);
      }
    } catch (err) {
      this.logger.error(`StuckChannelScheduler error: ${err}`);
    }
  }
}
