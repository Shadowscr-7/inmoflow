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
} from "@nestjs/common";
import { LeadSourcesService } from "./lead-sources.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { LeadSourceType, UserRole } from "@inmoflow/db";
import { CreateLeadSourceDto, UpdateLeadSourceDto } from "./dto";

@Controller("lead-sources")
@UseGuards(JwtAuthGuard, TenantGuard)
export class LeadSourcesController {
  constructor(private readonly leadSourcesService: LeadSourcesService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("type") type?: LeadSourceType,
    @Query("enriched") enriched?: string,
  ) {
    if (enriched === "true") {
      return this.leadSourcesService.findAllEnriched(tenantId);
    }
    return this.leadSourcesService.findAll(tenantId, type);
  }

  @Get(":id")
  findById(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.leadSourcesService.findById(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  create(
    @TenantId() tenantId: string,
    @Body() body: CreateLeadSourceDto,
  ) {
    return this.leadSourcesService.create(tenantId, body);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  update(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() body: UpdateLeadSourceDto,
  ) {
    return this.leadSourcesService.update(tenantId, id, body);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  delete(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.leadSourcesService.delete(tenantId, id);
  }

  @Post(":id/regenerate-key")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  regenerateApiKey(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.leadSourcesService.regenerateApiKey(tenantId, id);
  }
}
