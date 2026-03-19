import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { QueuedActionsService } from "./queued-actions.service";

import { UserRole } from "@inmoflow/db";

@Controller("queued-actions")
@UseGuards(JwtAuthGuard, TenantGuard)
export class QueuedActionsController {
  constructor(private readonly service: QueuedActionsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Query("status") status?: string,
    @Query("ruleId") ruleId?: string,
  ) {
    const assigneeId = user.role === "AGENT" ? user.userId : undefined;
    return this.service.findAll(tenantId, { status, ruleId, assigneeId });
  }

  @Get("count")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  async count(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    const assigneeId = user.role === "AGENT" ? user.userId : undefined;
    const pending = await this.service.countPending(tenantId, assigneeId);
    return { pending };
  }

  /** Cancel a single pending queued action */
  @Patch(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  cancel(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    const assigneeId = user.role === "AGENT" ? user.userId : undefined;
    return this.service.cancel(tenantId, id, assigneeId);
  }

  /** Cancel all pending queued actions */
  @Delete("cancel-all")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  @HttpCode(HttpStatus.OK)
  cancelAll(@TenantId() tenantId: string) {
    return this.service.cancelAll(tenantId);
  }

  /** Retry a failed queued action */
  @Patch(":id/retry")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  retry(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    const assigneeId = user.role === "AGENT" ? user.userId : undefined;
    return this.service.retry(tenantId, id, assigneeId);
  }
}
