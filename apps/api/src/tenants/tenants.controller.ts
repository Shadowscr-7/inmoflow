import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";
import { CreateTenantDto, UpdateTenantDto } from "./dto";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /** ADMIN only: create a new tenant */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async create(@Body() body: CreateTenantDto) {
    return this.tenantsService.create(body);
  }

  /** Authenticated: get current tenant info */
  @Get("me")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async me(@TenantId() tenantId: string) {
    return this.tenantsService.findById(tenantId);
  }

  /** ADMIN only: list all tenants */
  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN")
  async findAll() {
    return this.tenantsService.findAll();
  }

  /** ADMIN only: update a tenant (plan, name) */
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async update(@Param("id") id: string, @Body() body: UpdateTenantDto) {
    return this.tenantsService.update(id, body);
  }
}
