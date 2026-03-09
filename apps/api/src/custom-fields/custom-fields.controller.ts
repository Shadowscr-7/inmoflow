import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { CustomFieldsService } from "./custom-fields.service";
import { CreateCustomFieldDto, UpdateCustomFieldDto, SetFieldValuesDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";

@Controller("custom-fields")
@UseGuards(JwtAuthGuard, TenantGuard)
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  // ─── Definitions CRUD ────────────────────────────

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.findAllDefinitions(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  create(@TenantId() tenantId: string, @Body() dto: CreateCustomFieldDto) {
    return this.service.createDefinition(tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.service.updateDefinition(tenantId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.service.removeDefinition(tenantId, id);
  }

  // ─── Lead field values ──────────────────────────

  @Get("leads/:leadId")
  getLeadValues(@TenantId() tenantId: string, @Param("leadId") leadId: string) {
    return this.service.getLeadValues(tenantId, leadId);
  }

  @Post("leads/:leadId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  setLeadValues(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Body() dto: SetFieldValuesDto,
  ) {
    return this.service.setLeadValues(tenantId, leadId, dto.values);
  }
}
