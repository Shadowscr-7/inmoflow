import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";

/**
 * Standard JWT auth guard — extracts user from token.
 * Use on routes that need authentication.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}

/**
 * TenantGuard — ensures the authenticated user can access tenant data.
 * - ADMIN users (no tenantId) can pass an X-Tenant-Id header to scope to any tenant.
 *   If no header is provided, request.tenantId will be null (admin global access).
 * - Other users must have a tenantId from their JWT.
 *
 * Attaches tenantId to request for downstream use.
 *
 * Usage: @UseGuards(JwtAuthGuard, TenantGuard)
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // ADMIN (super-admin) has no tenantId — use header if provided
    if (user?.role === "ADMIN") {
      const headerTenantId = request.headers["x-tenant-id"];
      request.tenantId = headerTenantId || null;
      return true;
    }

    if (!user?.tenantId) {
      return false;
    }

    // Attach tenantId to request for easy access in services
    request.tenantId = user.tenantId;
    return true;
  }
}

/**
 * @Roles(...roles) — decorator to restrict access to specific roles.
 * Use with RolesGuard.
 */
export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * RolesGuard — checks if the user has one of the required roles.
 * Usage: @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard) + @Roles('ADMIN', 'BUSINESS')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
