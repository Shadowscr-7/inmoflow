import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";

@Controller("users")
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users — List users.
   * - ADMIN: returns all users (optional ?tenantId= filter)
   * - BUSINESS: returns users in own tenant
   * - AGENT/VIEWER: returns users in own tenant
   */
  @Get()
  findAll(
    @CurrentUser() user: { userId: string; tenantId: string | null; role: string },
    @TenantId() tenantId: string | null,
    @Query("tenantId") filterTenantId?: string,
  ) {
    if (user.role === "ADMIN") {
      return this.usersService.findAllAdmin(filterTenantId ?? undefined);
    }
    if (!tenantId) throw new ForbiddenException("Tenant required");
    return this.usersService.findAll(tenantId);
  }

  /**
   * GET /users/:id — Get a single user.
   */
  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; tenantId: string | null; role: string },
  ) {
    const target = await this.usersService.findById(id);
    // ADMIN can see anyone, others only their own tenant
    if (user.role !== "ADMIN" && target.tenantId !== user.tenantId) {
      throw new ForbiddenException("Cannot access users from another tenant");
    }
    return target;
  }

  /**
   * POST /users — Create a user.
   * - ADMIN/BUSINESS can create users. ADMIN can specify tenantId in body.
   * - AGENT/VIEWER cannot create users.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  create(
    @CurrentUser() user: { userId: string; tenantId: string | null; role: string },
    @TenantId() tenantId: string | null,
    @Body() dto: CreateUserDto,
  ) {
    // ADMIN can specify which tenant to create the user in
    const targetTenantId = user.role === "ADMIN" && dto.tenantId ? dto.tenantId : tenantId;
    if (!targetTenantId) {
      throw new ForbiddenException("Tenant ID required to create a user");
    }
    return this.usersService.create(targetTenantId, dto);
  }

  /**
   * PATCH /users/:id — Update a user (name, role, email, password, isActive).
   */
  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { userId: string; tenantId: string | null; role: string },
  ) {
    return this.usersService.update(id, dto, user.tenantId, user.role);
  }

  /**
   * DELETE /users/:id — Deactivate a user (soft delete).
   */
  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  deactivate(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; tenantId: string | null; role: string },
  ) {
    return this.usersService.deactivate(id, user.tenantId, user.role);
  }
}
