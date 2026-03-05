import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { TagsService } from "./tags.service";
import { CreateTagDto, UpdateTagDto, AssignTagsDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";

@Controller("tags")
@UseGuards(JwtAuthGuard, TenantGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.tagsService.findAll(tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  create(@TenantId() tenantId: string, @Body() dto: CreateTagDto) {
    return this.tagsService.create(tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(tenantId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.tagsService.remove(tenantId, id);
  }

  // ─── Lead-Tag endpoints ─────────────────────────
  @Get("leads/:leadId")
  getLeadTags(@TenantId() tenantId: string, @Param("leadId") leadId: string) {
    return this.tagsService.getLeadTags(tenantId, leadId);
  }

  @Post("leads/:leadId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  setLeadTags(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Body() dto: AssignTagsDto,
  ) {
    return this.tagsService.setLeadTags(tenantId, leadId, dto.tagIds);
  }

  @Delete("leads/:leadId/:tagId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  removeLeadTag(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Param("tagId") tagId: string,
  ) {
    return this.tagsService.removeLeadTag(tenantId, leadId, tagId);
  }
}
