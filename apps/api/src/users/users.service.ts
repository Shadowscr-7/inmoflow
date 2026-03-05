import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { UserRole } from "@inmoflow/db";
import { PlanService } from "../plan/plan.service";

export interface CreateUserDto {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
  tenantId?: string; // Only used by ADMIN when creating users for a tenant
}

export interface UpdateUserDto {
  name?: string;
  role?: UserRole;
  email?: string;
  password?: string;
  isActive?: boolean;
}

const USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  tenant: { select: { id: true, name: true } },
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly planService: PlanService,
  ) {}

  /** Create a user in a tenant. ADMIN can specify tenantId, BUSINESS creates in own tenant. */
  async create(tenantId: string, dto: CreateUserDto) {
    // Check plan user limit
    await this.planService.checkUserLimit(tenantId);

    const exists = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });
    if (exists) throw new ConflictException("Email already in use");

    const passwordHash = await this.authService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role ?? UserRole.AGENT,
      },
      select: USER_SELECT,
    });
  }

  /** Create a super-admin (no tenant). Only ADMIN can call this. */
  async createSuperAdmin(dto: { email: string; password: string; name?: string }) {
    const exists = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: null },
    });
    if (exists) throw new ConflictException("Email already in use for admin");

    const passwordHash = await this.authService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        tenantId: null,
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: UserRole.ADMIN,
      },
      select: USER_SELECT,
    });
  }

  /** List users for a specific tenant (BUSINESS or scoped ADMIN view) */
  async findAll(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: USER_SELECT,
      orderBy: { name: "asc" },
    });
  }

  /** ADMIN: list all users across all tenants, with optional tenantId filter */
  async findAllAdmin(filterTenantId?: string) {
    return this.prisma.user.findMany({
      where: {
        ...(filterTenantId ? { tenantId: filterTenantId } : {}),
        isActive: true,
      },
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Find a single user by ID */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  /** Update a user. Returns updated user. */
  async update(id: string, dto: UpdateUserDto, callerTenantId: string | null, callerRole: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    // ADMIN can update anyone. BUSINESS can only update users in their tenant.
    if (callerRole !== "ADMIN" && user.tenantId !== callerTenantId) {
      throw new ForbiddenException("Cannot update users from another tenant");
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) {
      data.passwordHash = await this.authService.hashPassword(dto.password);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  /** Deactivate a user (soft-delete) */
  async deactivate(id: string, callerTenantId: string | null, callerRole: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (callerRole !== "ADMIN" && user.tenantId !== callerTenantId) {
      throw new ForbiddenException("Cannot deactivate users from another tenant");
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
  }
}
