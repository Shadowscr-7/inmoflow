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
import { RulesService } from "./rules.service";
import { CreateRuleDto, UpdateRuleDto } from "./dto";

@Controller("rules")
@UseGuards(JwtAuthGuard, TenantGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /** All rules (admin view, includes user info) */
  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("trigger") trigger?: string,
    @Query("enabled") enabled?: string,
  ) {
    return this.rules.findAll(tenantId, {
      trigger,
      enabled: enabled !== undefined ? enabled === "true" : undefined,
    });
  }

  /** Rules visible to the current user: own + global */
  @Get("mine")
  findMine(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Query("trigger") trigger?: string,
    @Query("enabled") enabled?: string,
  ) {
    return this.rules.findForUser(tenantId, user.userId, {
      trigger,
      enabled: enabled !== undefined ? enabled === "true" : undefined,
    });
  }

  @Get(":id")
  findById(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.rules.findById(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: CreateRuleDto,
  ) {
    const isGlobal = dto.global === true && ["BUSINESS", "ADMIN"].includes(user.role);
    return this.rules.create(tenantId, dto, isGlobal ? undefined : user.userId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  update(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() user: { userId: string; role: string },
  ) {
    return this.rules.update(tenantId, id, dto, user.userId, user.role);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@TenantId() tenantId: string, @Param("id") id: string) {
    await this.rules.delete(tenantId, id);
  }
}
