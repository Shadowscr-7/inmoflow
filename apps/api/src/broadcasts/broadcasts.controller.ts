import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { BroadcastsService } from "./broadcasts.service";
import { CreateBroadcastDto, UpdateItemsDto, SendBatchDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";

type CallerCtx = { userId: string; tenantId: string | null; role: string };

@Controller("broadcasts")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles("ADMIN", "BUSINESS")
export class BroadcastsController {
  constructor(private readonly service: BroadcastsService) {}

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: CallerCtx,
    @Body() dto: CreateBroadcastDto,
  ) {
    return this.service.create(tenantId, user.userId, dto);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @Patch(":id/items")
  updateItems(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateItemsDto,
  ) {
    return this.service.updateItems(id, tenantId, dto);
  }

  @Post(":id/send")
  send(
    @Param("id") id: string,
    @TenantId() tenantId: string,
    @Body() dto: SendBatchDto,
  ) {
    return this.service.send(id, tenantId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param("id") id: string, @TenantId() tenantId: string) {
    return this.service.cancel(id, tenantId);
  }
}
