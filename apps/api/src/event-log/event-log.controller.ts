import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { EventLogService } from "./event-log.service";
import { JwtAuthGuard, TenantGuard, TenantId } from "../auth";
import { EventType } from "@inmoflow/db";

@Controller("event-logs")
@UseGuards(JwtAuthGuard, TenantGuard)
export class EventLogController {
  constructor(private readonly eventLogService: EventLogService) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("type") type?: EventType,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.eventLogService.findByTenant(tenantId, {
      entity,
      entityId,
      type,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }
}
