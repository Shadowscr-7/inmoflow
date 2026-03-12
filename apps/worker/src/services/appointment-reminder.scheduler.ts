import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

/**
 * AppointmentReminderScheduler — Cron job that sends notifications
 * to agents about upcoming appointments/visits.
 *
 * Runs every 15 minutes. Sends a reminder 1 hour before the visit
 * for visits that haven't been reminded yet.
 */
@Injectable()
export class AppointmentReminderScheduler {
  private readonly logger = new Logger(AppointmentReminderScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleReminders(): Promise<void> {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    try {
      // Find visits that are scheduled within the next hour and haven't been reminded
      const upcomingVisits = await this.prisma.visit.findMany({
        where: {
          date: { gte: now, lte: oneHourFromNow },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          reminderSent: false,
          agentId: { not: null },
        },
        include: {
          lead: { select: { id: true, name: true, phone: true } },
        },
      });

      if (upcomingVisits.length === 0) return;

      this.logger.log(`Sending reminders for ${upcomingVisits.length} upcoming visits`);

      for (const visit of upcomingVisits) {
        if (!visit.agentId) continue;

        const visitTime = new Date(visit.date).toLocaleTimeString("es", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const visitDate = new Date(visit.date).toLocaleDateString("es", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

        // Create notification for the agent
        await this.prisma.notification.create({
          data: {
            tenantId: visit.tenantId,
            userId: visit.agentId,
            type: "rule",
            title: "⏰ Recordatorio de visita",
            message: `Tenés una visita ${visit.createdByAi ? "agendada por IA " : ""}con ${visit.lead?.name ?? "un lead"} hoy ${visitDate} a las ${visitTime}.${visit.address ? ` Dirección: ${visit.address}` : ""}`,
            entity: "Lead",
            entityId: visit.leadId,
          },
        });

        // Mark as reminded
        await this.prisma.visit.update({
          where: { id: visit.id },
          data: { reminderSent: true },
        });

        this.logger.log(`Reminder sent for visit ${visit.id} — agent ${visit.agentId}`);
      }
    } catch (err) {
      this.logger.error(`Appointment reminder error: ${err}`);
    }
  }
}
