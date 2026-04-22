import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Res,
  NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import { ReelVideoService } from "./reel-video.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";
import * as fs from "fs";

/* ─── Authenticated endpoints (tenants) ─────────────────── */

@Controller("reel-video")
@UseGuards(JwtAuthGuard, TenantGuard)
export class ReelVideoController {
  constructor(private readonly reelVideoService: ReelVideoService) {}

  @Post(":propertyId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  async startReel(
    @TenantId() tenantId: string,
    @Param("propertyId") propertyId: string,
    @Body()
    body: {
      agentName: string;
      agentPhone: string;
      voiceGender?: "female" | "male";
    },
  ) {
    const job = await this.reelVideoService.startReel(tenantId, propertyId, {
      agentName: body.agentName,
      agentPhone: body.agentPhone,
      voiceGender: body.voiceGender ?? "female",
    });
    return { jobId: job.id, status: job.status };
  }

  @Get()
  listJobs(@TenantId() tenantId: string) {
    return this.reelVideoService.getJobsByTenant(tenantId);
  }

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

  @Get(":jobId/download")
  downloadVideo(@Param("jobId") jobId: string, @Res() res: Response) {
    const filePath = this.reelVideoService.getOutputPath(jobId);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="reel-${jobId}.mp4"`);
    fs.createReadStream(filePath).pipe(res);
  }
}

/* ─── Internal endpoint for Remotion renderer (no auth) ─── */

@Controller("reel-video-internal")
export class ReelVideoInternalController {
  constructor(private readonly reelVideoService: ReelVideoService) {}

  /** Serve TTS audio for Remotion's Chromium renderer — no auth, unguessable jobId. */
  @Get(":jobId/audio")
  serveAudio(@Param("jobId") jobId: string, @Res() res: Response) {
    const audioPath = this.reelVideoService.getAudioPath(jobId);
    if (!audioPath) throw new NotFoundException("Audio not found");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(audioPath).pipe(res);
  }
}
