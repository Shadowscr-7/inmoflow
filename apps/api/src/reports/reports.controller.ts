import {
  Controller, Get, Query, UseGuards, Res, Header,
} from "@nestjs/common";
import { Response } from "express";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";

@Controller("reports")
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─── JSON endpoints ──────────────────────────────

  @Get("summary")
  getSummary(
    @TenantId() tenantId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getSummaryReport(tenantId, from, to);
  }

  @Get("leads")
  getLeadsReport(
    @TenantId() tenantId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
    @Query("stageId") stageId?: string,
    @Query("assigneeId") assigneeId?: string,
  ) {
    return this.reportsService.getLeadsExport(tenantId, { from, to, status, stageId, assigneeId });
  }

  @Get("properties")
  getPropertiesReport(
    @TenantId() tenantId: string,
    @Query("status") status?: string,
  ) {
    return this.reportsService.getPropertiesExport(tenantId, { status });
  }

  // ─── CSV download endpoints ──────────────────────

  @Get("leads/csv")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  async downloadLeadsCSV(
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
    @Query("stageId") stageId?: string,
    @Query("assigneeId") assigneeId?: string,
  ) {
    const data = await this.reportsService.getLeadsExport(tenantId, { from, to, status, stageId, assigneeId });
    const csv = this.reportsService.toCSV(data);
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${date}.csv"`);
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  }

  @Get("properties/csv")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  async downloadPropertiesCSV(
    @TenantId() tenantId: string,
    @Res() res: Response,
    @Query("status") status?: string,
  ) {
    const data = await this.reportsService.getPropertiesExport(tenantId, { status });
    const csv = this.reportsService.toCSV(data);
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="propiedades-${date}.csv"`);
    res.send("\uFEFF" + csv);
  }
}
