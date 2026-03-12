import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * GoogleCalendarService — Handles OAuth2 flow and bidirectional sync
 * between InmoFlow visits and Google Calendar events.
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
 * Uses Google Calendar API v3 via REST (no SDK dependency).
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  private readonly clientId = process.env.GOOGLE_CLIENT_ID;
  private readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  private readonly SCOPES = "https://www.googleapis.com/auth/calendar.events";

  constructor(private readonly prisma: PrismaService) {}

  private get isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  private getRedirectUri(): string {
    const base = process.env.FRONTEND_URL ?? "http://localhost:3000";
    return `${base}/dashboard/profile/availability/google-callback`;
  }

  // ─── OAuth2 Flow ─────────────────────────────────────

  /**
   * Get the Google OAuth2 authorization URL.
   * The user will be redirected to this URL to grant access.
   */
  getAuthUrl(userId: string): string {
    if (!this.isConfigured) {
      throw new BadRequestException("Google Calendar no está configurado en el servidor");
    }

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.getRedirectUri(),
      response_type: "code",
      scope: this.SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: userId, // We pass the userId as state to identify on callback
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange the authorization code for tokens and store the refresh token.
   */
  async handleCallback(code: string, userId: string): Promise<void> {
    if (!this.isConfigured) {
      throw new BadRequestException("Google Calendar no está configurado");
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.getRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Google OAuth token exchange failed: ${err}`);
      throw new BadRequestException("Error al conectar con Google Calendar");
    }

    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      throw new BadRequestException("No se recibió refresh token. Intentá desconectar y volver a conectar.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarRefreshToken: tokens.refresh_token,
        googleCalendarEnabled: true,
      },
    });

    this.logger.log(`Google Calendar connected for user ${userId}`);
  }

  /** Disconnect Google Calendar for a user */
  async disconnect(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleCalendarRefreshToken: null,
        googleCalendarEnabled: false,
      },
    });
    this.logger.log(`Google Calendar disconnected for user ${userId}`);
  }

  /** Check if a user has Google Calendar connected */
  async isConnected(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleCalendarEnabled: true, googleCalendarRefreshToken: true },
    });
    return !!(user?.googleCalendarEnabled && user?.googleCalendarRefreshToken);
  }

  // ─── Token Management ───────────────────────────────

  /** Get a fresh access token using the stored refresh token */
  private async getAccessToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleCalendarRefreshToken: true, googleCalendarEnabled: true },
    });

    if (!user?.googleCalendarEnabled || !user?.googleCalendarRefreshToken) {
      return null;
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: user.googleCalendarRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      this.logger.error(`Failed to refresh Google token for user ${userId}`);
      // If refresh fails, disable the connection
      await this.disconnect(userId);
      return null;
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  // ─── Event CRUD ─────────────────────────────────────

  /**
   * Create a Google Calendar event for a visit.
   * Returns the Google event ID or null if sync is not enabled.
   */
  async createEvent(
    agentId: string,
    visit: {
      id: string;
      date: Date;
      endDate?: Date | null;
      address?: string | null;
      notes?: string | null;
      leadName?: string | null;
      propertyTitle?: string | null;
      createdByAi?: boolean;
    },
  ): Promise<string | null> {
    const accessToken = await this.getAccessToken(agentId);
    if (!accessToken) return null;

    const endDate = visit.endDate ?? new Date(visit.date.getTime() + 60 * 60 * 1000);

    const descParts: string[] = [];
    if (visit.leadName) descParts.push(`Lead: ${visit.leadName}`);
    if (visit.propertyTitle) descParts.push(`Propiedad: ${visit.propertyTitle}`);
    if (visit.notes) descParts.push(`Notas: ${visit.notes}`);
    if (visit.createdByAi) descParts.push("🤖 Agendada por IA automáticamente");

    const event = {
      summary: `Visita: ${visit.leadName ?? "Lead"}${visit.propertyTitle ? ` - ${visit.propertyTitle}` : ""}`,
      description: descParts.join("\n"),
      location: visit.address ?? undefined,
      start: {
        dateTime: visit.date.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
      source: {
        title: "InmoFlow",
        url: process.env.FRONTEND_URL ?? "https://inmoflow.com",
      },
    };

    try {
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`Google Calendar create event failed: ${err}`);
        return null;
      }

      const created = (await res.json()) as { id: string };
      this.logger.log(`Google Calendar event created: ${created.id} for visit ${visit.id}`);
      return created.id;
    } catch (err) {
      this.logger.error(`Google Calendar create event error: ${err}`);
      return null;
    }
  }

  /**
   * Update a Google Calendar event for a visit.
   */
  async updateEvent(
    agentId: string,
    googleEventId: string,
    visit: {
      date: Date;
      endDate?: Date | null;
      address?: string | null;
      notes?: string | null;
      leadName?: string | null;
      propertyTitle?: string | null;
      status?: string;
    },
  ): Promise<void> {
    const accessToken = await this.getAccessToken(agentId);
    if (!accessToken) return;

    const endDate = visit.endDate ?? new Date(visit.date.getTime() + 60 * 60 * 1000);

    const descParts: string[] = [];
    if (visit.leadName) descParts.push(`Lead: ${visit.leadName}`);
    if (visit.propertyTitle) descParts.push(`Propiedad: ${visit.propertyTitle}`);
    if (visit.notes) descParts.push(`Notas: ${visit.notes}`);

    const statusMap: Record<string, string> = {
      SCHEDULED: "tentative",
      CONFIRMED: "confirmed",
      COMPLETED: "confirmed",
      CANCELLED: "cancelled",
      NO_SHOW: "cancelled",
    };

    const event = {
      summary: `Visita: ${visit.leadName ?? "Lead"}${visit.propertyTitle ? ` - ${visit.propertyTitle}` : ""}`,
      description: descParts.join("\n"),
      location: visit.address ?? undefined,
      start: {
        dateTime: visit.date.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "America/Argentina/Buenos_Aires",
      },
      status: statusMap[visit.status ?? "SCHEDULED"] ?? "tentative",
    };

    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );

      if (!res.ok) {
        this.logger.error(`Google Calendar update event failed: ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Google Calendar update event error: ${err}`);
    }
  }

  /**
   * Delete a Google Calendar event.
   */
  async deleteEvent(agentId: string, googleEventId: string): Promise<void> {
    const accessToken = await this.getAccessToken(agentId);
    if (!accessToken) return;

    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (err) {
      this.logger.error(`Google Calendar delete event error: ${err}`);
    }
  }
}
