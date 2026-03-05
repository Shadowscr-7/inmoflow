import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * @TenantId() — extracts tenantId from the authenticated request.
 * Requires JwtAuthGuard + TenantGuard to be active.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId;
  },
);

/**
 * @CurrentUser() — extracts the full user object from JWT.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
