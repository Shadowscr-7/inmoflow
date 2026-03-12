import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  Headers,
} from "@nestjs/common";
import { Response } from "express";
import { CalendarService } from "./calendar.service";
import { GoogleCalendarService } from "./google-calendar.service";
import { JwtAuthGuard, TenantGuard, CurrentUser } from "../auth";

/**
 * CalendarController — Handles ICS feed (public) and Google Calendar OAuth (authenticated).
 */
@Controller("calendar")
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) {}

  // ─── ICS Feed (Public, no auth) ─────────────────────

  /**
   * GET /api/calendar/:token.ics — Public ICS feed.
   * Any calendar app can subscribe to this URL.
   */
  @Get(":token.ics")
  async getIcsFeed(@Param("token") token: string, @Res() res: Response) {
    const ics = await this.calendarService.generateIcsFeed(token);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=inmoflow.ics");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(ics);
  }

  // ─── ICS Token Management (Authenticated) ───────────

  /**
   * GET /api/calendar/token — Get current calendar token.
   */
  @Get("token")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getToken(@CurrentUser() user: { userId: string }) {
    const token = await this.calendarService.getToken(user.userId);
    return { token };
  }

  /**
   * POST /api/calendar/token — Generate or regenerate calendar token.
   */
  @Post("token")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async generateToken(@CurrentUser() user: { userId: string }) {
    const token = await this.calendarService.generateToken(user.userId);
    return { token };
  }

  /**
   * DELETE /api/calendar/token — Revoke calendar token (disables ICS feed).
   */
  @Delete("token")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async revokeToken(@CurrentUser() user: { userId: string }) {
    await this.calendarService.revokeToken(user.userId);
    return { ok: true };
  }

  // ─── Google Calendar OAuth (Authenticated) ──────────

  /**
   * GET /api/calendar/google/auth-url — Get Google OAuth redirect URL.
   */
  @Get("google/auth-url")
  @UseGuards(JwtAuthGuard, TenantGuard)
  getGoogleAuthUrl(@CurrentUser() user: { userId: string }) {
    const url = this.googleCalendarService.getAuthUrl(user.userId);
    return { url };
  }

  /**
   * GET /api/calendar/google/callback — Handle Google OAuth callback.
   * Called from the frontend after Google redirects back with the code.
   */
  @Get("google/callback")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async googleCallback(
    @CurrentUser() user: { userId: string },
    @Query("code") code: string,
  ) {
    await this.googleCalendarService.handleCallback(code, user.userId);
    return { ok: true, message: "Google Calendar conectado exitosamente" };
  }

  /**
   * GET /api/calendar/google/status — Check if Google Calendar is connected.
   */
  @Get("google/status")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async googleStatus(@CurrentUser() user: { userId: string }) {
    const connected = await this.googleCalendarService.isConnected(user.userId);
    return { connected };
  }

  /**
   * DELETE /api/calendar/google — Disconnect Google Calendar.
   */
  @Delete("google")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async googleDisconnect(@CurrentUser() user: { userId: string }) {
    await this.googleCalendarService.disconnect(user.userId);
    return { ok: true, message: "Google Calendar desconectado" };
  }
}
