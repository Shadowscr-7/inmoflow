import { Controller, Get, Post, Query, Param, UseGuards, Logger, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { LeadRecoveryService } from "./lead-recovery.service";

@Controller("lead-recovery")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles("ADMIN", "BUSINESS")
export class LeadRecoveryController {
  private readonly logger = new Logger(LeadRecoveryController.name);

  constructor(private readonly service: LeadRecoveryService) {}

  /**
   * GET /lead-recovery?from=ISO&to=ISO
   * Fetch leads from Meta Graph API for the given date range.
   * Persists pending entries and returns the full list with statuses.
   */
  @Get()
  async fetch(
    @TenantId() tenantId: string,
    @Query("from") fromStr: string,
    @Query("to") toStr: string,
  ) {
    if (!fromStr || !toStr) {
      throw new BadRequestException("Los parámetros 'from' y 'to' son requeridos");
    }

    const from = new Date(fromStr);
    const to = new Date(toStr);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException("Fechas inválidas");
    }
    if (from > to) {
      throw new BadRequestException("'from' debe ser anterior a 'to'");
    }

    // Limit range to 90 days
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      throw new BadRequestException("El rango máximo es de 90 días");
    }

    const result = await this.service.fetchFromMeta(tenantId, from, to);

    // Persist pending entries for items not yet in DB
    for (const item of result.items) {
      if (item.status === "PENDING" && !item.approvalId) {
        await this.service.upsertPending(tenantId, item.leadgenId, {
          sourceId: item.sourceId,
          pageId: item.pageId,
          formId: item.formId,
          formName: item.formName,
          fields: {
            ...(item.name ? { full_name: item.name } : {}),
            ...(item.phone ? { phone_number: item.phone } : {}),
            ...(item.email ? { email: item.email } : {}),
          },
          customFields: item.customFields,
          rawRecord: item,
        });
      }
    }

    return result;
  }

  /**
   * POST /lead-recovery/:leadgenId/approve
   * Approve a pending lead → creates it in the CRM.
   */
  @Post(":leadgenId/approve")
  async approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Param("leadgenId") leadgenId: string,
  ) {
    return this.service.approve(tenantId, leadgenId, user.userId);
  }

  /**
   * POST /lead-recovery/:leadgenId/reject
   * Reject a pending lead → marks as discarded.
   */
  @Post(":leadgenId/reject")
  async reject(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Param("leadgenId") leadgenId: string,
  ) {
    return this.service.reject(tenantId, leadgenId, user.userId);
  }
}
