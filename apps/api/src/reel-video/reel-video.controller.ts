import {
  Controller, Get, Post, Param, Body, UseGuards, Res, HttpCode, HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { ReelVideoService } from "./reel-video.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";
import * as fs from "fs";

@Controller("reel-video")
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReelVideoController {
  constructor(private readonly reelVideoService: ReelVideoService) {}

  /** Start generating a reel video for a property */
  @Post(":propertyId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  async startReel(
    @TenantId() tenantId: string,
    @Param("propertyId") propertyId: string,
    @Body() body: { agentName: string; agentPhone: string; musicUrl?: string },
  ) {
    const job = await this.reelVideoService.startReel(tenantId, propertyId, body);
    return { jobId: job.id, status: job.status };
  }

  /** Get all reel jobs for this tenant */
  @Get()
  listJobs(@TenantId() tenantId: string) {
    return this.reelVideoService.getJobsByTenant(tenantId);
  }

  /** Get status of a specific reel job */
  @Get(":jobId/status")
  getStatus(@Param("jobId") jobId: string) {
    const job = this.reelVideoService.getJob(jobId);
    if (!job) return { status: "not_found" };
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      propertyTitle: job.propertyTitle,
      error: job.error,
    };
  }

  /** Download the rendered video */
  @Get(":jobId/download")
  downloadVideo(@Param("jobId") jobId: string, @Res() res: Response) {
    const filePath = this.reelVideoService.getOutputPath(jobId);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="reel-${jobId}.mp4"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}
