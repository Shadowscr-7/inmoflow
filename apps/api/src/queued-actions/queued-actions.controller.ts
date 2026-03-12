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
import { TenantId } from "../auth/decorators";
import { QueuedActionsService } from "./queued-actions.service";

import { UserRole } from "@inmoflow/db";

@Controller("queued-actions")
@UseGuards(JwtAuthGuard, TenantGuard)
export class QueuedActionsController {
  constructor(private readonly service: QueuedActionsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  findAll(
    @TenantId() tenantId: string,
    @Query("status") status?: string,
    @Query("ruleId") ruleId?: string,
  ) {
    return this.service.findAll(tenantId, { status, ruleId });
  }

  @Get("count")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  async count(@TenantId() tenantId: string) {
    const pending = await this.service.countPending(tenantId);
    return { pending };
  }

  /** Cancel a single pending queued action */
  @Patch(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  cancel(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.service.cancel(tenantId, id);
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
  @Roles("ADMIN", "BUSINESS")
  retry(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.service.retry(tenantId, id);
  }
}
