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
    // BUSINESS can only create AGENT or VIEWER accounts
    if (user.role === "BUSINESS" && dto.role && !["AGENT", "VIEWER"].includes(dto.role)) {
      throw new ForbiddenException("BUSINESS users can only create AGENT or VIEWER accounts");
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
    // BUSINESS can only assign AGENT or VIEWER roles
    if (user.role === "BUSINESS" && dto.role && !["AGENT", "VIEWER"].includes(dto.role)) {
      throw new ForbiddenException("BUSINESS users can only assign AGENT or VIEWER roles");
    }
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

  // ─── Agent Availability ──────────────────────────────

  /** GET /users/me/availability — Get my weekly availability */
  @Get("me/availability")
  getMyAvailability(@CurrentUser() user: { userId: string }) {
    return this.usersService.getAvailability(user.userId);
  }

  /** GET /users/:id/availability — Get an agent's availability */
  @Get(":id/availability")
  getAvailability(@Param("id") id: string) {
    return this.usersService.getAvailability(id);
  }

  /** PUT /users/me/availability — Set my weekly availability */
  @Patch("me/availability")
  setMyAvailability(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { slots: { dayOfWeek: number; startTime: string; endTime: string; active: boolean }[] },
  ) {
    return this.usersService.setAvailability(tenantId, user.userId, body.slots);
  }

  /** GET /users/:id/available-slots — Get available appointment slots for an agent */
  @Get(":id/available-slots")
  getAvailableSlots(
    @TenantId() tenantId: string,
    @Param("id") agentId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.usersService.getAvailableSlots(tenantId, agentId, from, to);
  }
}
