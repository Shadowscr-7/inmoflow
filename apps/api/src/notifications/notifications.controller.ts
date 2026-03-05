import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, TenantGuard } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.notifications.findForUser(tenantId, user.userId, user.role, {
      unreadOnly: unread === "true",
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Patch(":id/read")
  markRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Param("id") id: string,
  ) {
    return this.notifications.markRead(tenantId, id, user.userId, user.role);
  }

  @Patch("read-all")
  markAllRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.notifications.markAllRead(tenantId, user.userId, user.role);
  }

  // ─── Notification Preferences ─────────────────────

  @Get("preferences")
  getPreferences(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.notifications.getPreferences(tenantId, user.userId);
  }

  @Patch("preferences")
  updatePreferences(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: {
      pushEnabled?: boolean;
      emailDigest?: "NONE" | "DAILY" | "WEEKLY";
      pushSubscription?: unknown;
    },
  ) {
    return this.notifications.updatePreferences(tenantId, user.userId, body);
  }
}
