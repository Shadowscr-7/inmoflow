import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomBytes } from "crypto";

/**
 * CalendarService — Handles ICS feed generation and calendar token management.
 *
 * The ICS feed allows any calendar app (Google Calendar, Apple Calendar,
 * Outlook, etc.) to subscribe to an agent's visit schedule via a URL.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Token Management ────────────────────────────────

  /** Generate or regenerate a unique calendar token for a user */
  async generateToken(userId: string): Promise<string> {
    const token = randomBytes(24).toString("hex"); // 48-char hex token
    await this.prisma.user.update({
      where: { id: userId },
      data: { calendarToken: token },
    });
    return token;
  }

  /** Get the existing calendar token for a user */
  async getToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { calendarToken: true },
    });
    return user?.calendarToken ?? null;
  }

  /** Revoke (remove) the calendar token */
  async revokeToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { calendarToken: null },
    });
  }

  // ─── ICS Feed Generation ─────────────────────────────

  /**
   * Generate an ICS calendar file content for a given calendar token.
   * Returns visits from the last 30 days + next 90 days.
   */
  async generateIcsFeed(token: string): Promise<string> {
    // Find user by token
    const user = await this.prisma.user.findFirst({
      where: { calendarToken: token },
      select: { id: true, name: true, email: true, tenantId: true, tenant: { select: { name: true } } },
    });

    if (!user || !user.tenantId) {
      throw new NotFoundException("Calendar not found");
    }

    // Fetch visits: past 30 days + next 90 days
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const visits = await this.prisma.visit.findMany({
      where: {
        tenantId: user.tenantId,
        agentId: user.id,
        date: { gte: from, lte: to },
        status: { in: ["SCHEDULED", "CONFIRMED", "COMPLETED"] },
      },
      include: {
        lead: { select: { name: true, phone: true, email: true } },
        property: { select: { title: true, address: true } },
      },
      orderBy: { date: "asc" },
    });

    const calName = `InmoFlow - ${user.name ?? user.email}`;
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//InmoFlow//Calendar//ES",
      `X-WR-CALNAME:${calName}`,
      `X-WR-CALDESC:Visitas de ${user.name ?? user.email} en ${user.tenant?.name ?? "InmoFlow"}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const visit of visits) {
      const dtStart = this.toIcsDate(visit.date);
      const dtEnd = visit.endDate
        ? this.toIcsDate(visit.endDate)
        : this.toIcsDate(new Date(visit.date.getTime() + 60 * 60 * 1000)); // Default 1h duration

      const summary = this.escapeIcs(
        `Visita: ${visit.lead?.name ?? "Lead"}${visit.property ? ` - ${visit.property.title}` : ""}`,
      );

      const descParts: string[] = [];
      if (visit.lead?.name) descParts.push(`Lead: ${visit.lead.name}`);
      if (visit.lead?.phone) descParts.push(`Tel: ${visit.lead.phone}`);
      if (visit.lead?.email) descParts.push(`Email: ${visit.lead.email}`);
      if (visit.property?.title) descParts.push(`Propiedad: ${visit.property.title}`);
      if (visit.notes) descParts.push(`Notas: ${visit.notes}`);
      if (visit.createdByAi) descParts.push("🤖 Agendada por IA");
      const description = this.escapeIcs(descParts.join("\\n"));

      const location = visit.address
        ? this.escapeIcs(visit.address)
        : visit.property?.address
          ? this.escapeIcs(visit.property.address)
          : "";

      const STATUS_MAP: Record<string, string> = {
        SCHEDULED: "TENTATIVE",
        CONFIRMED: "CONFIRMED",
        COMPLETED: "CONFIRMED",
      };

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${visit.id}@inmoflow`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      lines.push(`SUMMARY:${summary}`);
      if (description) lines.push(`DESCRIPTION:${description}`);
      if (location) lines.push(`LOCATION:${location}`);
      lines.push(`STATUS:${STATUS_MAP[visit.status] ?? "TENTATIVE"}`);
      lines.push(`DTSTAMP:${this.toIcsDate(visit.updatedAt)}`);
      lines.push(`LAST-MODIFIED:${this.toIcsDate(visit.updatedAt)}`);
      if (visit.createdByAi) lines.push("CATEGORIES:IA");
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT60M");
      lines.push("ACTION:DISPLAY");
      lines.push("DESCRIPTION:Visita en 1 hora");
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  // ─── Helpers ─────────────────────────────────────────

  private toIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  private escapeIcs(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
  }
}
