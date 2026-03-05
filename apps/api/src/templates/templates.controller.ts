import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { TemplatesService } from "./templates.service";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";
import { MessageChannel } from "@inmoflow/db";

@Controller("templates")
@UseGuards(JwtAuthGuard, TenantGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** All templates (admin sees all, includes user info) */
  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("enabled") enabled?: string,
    @Query("channel") channel?: string,
  ) {
    return this.templates.findAll(tenantId, {
      enabled: enabled !== undefined ? enabled === "true" : undefined,
      channel: channel as MessageChannel | undefined,
    });
  }

  /** Templates visible to the current user: own + global */
  @Get("mine")
  findMine(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Query("enabled") enabled?: string,
    @Query("channel") channel?: string,
  ) {
    return this.templates.findForUser(tenantId, user.userId, {
      enabled: enabled !== undefined ? enabled === "true" : undefined,
      channel: channel as MessageChannel | undefined,
    });
  }

  @Get(":id")
  findById(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.templates.findById(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: CreateTemplateDto,
  ) {
    // If global flag is explicitly set and user is BUSINESS/ADMIN, create as global
    const isGlobal = dto.global === true && ["BUSINESS", "ADMIN"].includes(user.role);
    return this.templates.create(tenantId, dto, isGlobal ? undefined : user.userId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  update(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.templates.update(tenantId, id, dto, user.userId, user.role);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantId() tenantId: string, @Param("id") id: string) {
    await this.templates.delete(tenantId, id);
  }
}
