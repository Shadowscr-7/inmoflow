import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus, Headers,
} from "@nestjs/common";
import { TicketsService } from "./tickets.service";
import { CreateTicketDto, UpdateTicketDto, AddAttachmentsDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";
import { TicketStatus } from "@inmoflow/db";

type CallerCtx = { userId: string; tenantId: string | null; role: string };

@Controller("tickets")
@UseGuards(JwtAuthGuard, TenantGuard)
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: CallerCtx,
    @Body() dto: CreateTicketDto,
  ) {
    return this.service.create(tenantId, user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: CallerCtx,
    @TenantId() tenantId: string | null,
    @Query("status") status?: TicketStatus,
    @Query("tenantId") filterTenantId?: string,
    @Query("creatorId") creatorId?: string,
  ) {
    return this.service.findAll(user.role, tenantId, user.userId, {
      status,
      tenantId: filterTenantId,
      creatorId,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: CallerCtx, @TenantId() tenantId: string | null) {
    return this.service.findOne(id, user.role, tenantId, user.userId);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: CallerCtx,
    @TenantId() tenantId: string | null,
  ) {
    return this.service.update(id, dto, user.role, tenantId, user.userId);
  }

  @Post(":id/attachments")
  addAttachments(
    @Param("id") id: string,
    @Body() dto: AddAttachmentsDto,
    @CurrentUser() user: CallerCtx,
    @TenantId() tenantId: string | null,
  ) {
    return this.service.addAttachments(id, dto.attachments, user.role, tenantId, user.userId);
  }

  @Delete(":id/attachments/:attachmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttachment(
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: CallerCtx,
    @TenantId() tenantId: string | null,
  ) {
    return this.service.removeAttachment(attachmentId, user.role, tenantId, user.userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @CurrentUser() user: CallerCtx, @TenantId() tenantId: string | null) {
    return this.service.remove(id, user.role, tenantId, user.userId);
  }
}

@Controller("tickets")
export class TicketsPublicController {
  constructor(private readonly service: TicketsService) {}

  @Post(":id/resolve-callback")
  resolveCallback(
    @Param("id") id: string,
    @Headers("x-webhook-secret") secret: string,
    @Body() body: { note?: string },
  ) {
    return this.service.resolveByWebhook(id, secret, body.note);
  }
}
