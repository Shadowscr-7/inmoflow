import { Injectable, Logger, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { PropertiesService } from "../properties/properties.service";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ReelJob {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyTitle: string;
  status: "pending" | "bundling" | "rendering" | "done" | "error";
  progress: number;
  outputPath: string | null;
  error: string | null;
  createdAt: number;
}

interface StartReelInput {
  agentName: string;
  agentPhone: string;
  musicUrl?: string;
}

@Injectable()
export class ReelVideoService {
  private readonly logger = new Logger(ReelVideoService.name);
  private readonly uploadDir: string;
  private readonly outputDir: string;
  private readonly jobs = new Map<string, ReelJob>();

  constructor(private readonly propertiesService: PropertiesService) {
    this.uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");
    this.outputDir = path.join(this.uploadDir, "_reels");
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  getJob(jobId: string): ReelJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByTenant(tenantId: string): ReelJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.tenantId === tenantId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async startReel(tenantId: string, propertyId: string, input: StartReelInput): Promise<ReelJob> {
    const property = await this.propertiesService.findOne(tenantId, propertyId);

    const jobId = crypto.randomBytes(8).toString("hex");
    const job: ReelJob = {
      id: jobId,
      tenantId,
      propertyId,
      propertyTitle: property.title,
      status: "pending",
      progress: 0,
      outputPath: null,
      error: null,
      createdAt: Date.now(),
    };
    this.jobs.set(jobId, job);

    // Resolve local image paths from property media
    const photoUrls: string[] = [];
    const localPhotoPaths: string[] = [];
    if (property.media) {
      for (const m of property.media.filter((x) => x.kind === "image")) {
        const match = m.url.match(/\/api\/uploads\/files\/([^/]+)\/([^/]+)$/);
        if (match) {
          const [, fileTenantId, filename] = match;
          if (!fileTenantId.includes("..") && !filename.includes("..")) {
            const filePath = path.join(this.uploadDir, fileTenantId, filename);
            if (fs.existsSync(filePath)) {
              localPhotoPaths.push(filePath);
            }
          }
        }
        // Also keep the URL as fallback
        photoUrls.push(m.url);
      }
    }

    // Format price
    const priceStr = property.price
      ? `${property.currency ?? "USD"} ${property.price.toLocaleString("es")}`
      : "Consultar";

    // Build input props for Remotion
    const inputProps = {
      photos: localPhotoPaths, // Will be converted to file:// URLs for Remotion
      price: priceStr,
      address: property.address ?? property.zone ?? "",
      operationType: (property.operationType ?? "sale") as "sale" | "rent",
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      areaM2: property.areaM2,
      agentName: input.agentName,
      agentPhone: input.agentPhone,
      musicUrl: input.musicUrl ?? null,
    };

    // Run rendering in background (non-blocking)
    this.renderInBackground(job, inputProps).catch((err) => {
      this.logger.error(`Reel render failed for job ${jobId}`, err);
    });

    return job;
  }

  private async renderInBackground(
    job: ReelJob,
    inputProps: Record<string, unknown>,
  ): Promise<void> {
    try {
      job.status = "bundling";
      job.progress = 5;

      // Dynamic imports to avoid loading Remotion at startup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { bundle } = require("@remotion/bundler");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { renderMedia, selectComposition } = require("@remotion/renderer");

      // Convert local paths to file:// URLs for Remotion's browser
      const photos = (inputProps.photos as string[]).map(
        (p) => `file://${p.replace(/\\/g, "/")}`
      );

      const entryPoint = path.resolve(process.cwd(), "../../video/src/index.ts");
      job.progress = 10;

      const bundleLocation = await bundle({
        entryPoint,
        onProgress: (progress: number) => {
          job.progress = 10 + Math.round(progress * 20); // 10-30%
        },
      });

      job.status = "rendering";
      job.progress = 30;

      const fps = 30;
      const photoDuration = Math.round(3.5 * fps);
      const contactDuration = 4 * fps;
      const photoCount = Math.max(photos.length, 1);
      const totalDuration = photoCount * photoDuration + contactDuration;

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "PropertyReel",
        inputProps: { ...inputProps, photos },
      });

      // Override duration based on actual photo count
      composition.durationInFrames = totalDuration;

      const outputPath = path.join(this.outputDir, `reel_${job.id}.mp4`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: outputPath,
        inputProps: { ...inputProps, photos },
        onProgress: ({ progress }: { progress: number }) => {
          job.progress = 30 + Math.round(progress * 70); // 30-100%
        },
      });

      job.status = "done";
      job.progress = 100;
      job.outputPath = outputPath;

      this.logger.log(`Reel rendered successfully: ${outputPath}`);
    } catch (err: unknown) {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Unknown error";
      this.logger.error(`Reel rendering failed for job ${job.id}`, err);
    }
  }

  getOutputPath(jobId: string): string {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "done" || !job.outputPath) {
      throw new NotFoundException("Video not ready");
    }
    if (!fs.existsSync(job.outputPath)) {
      throw new NotFoundException("Video file not found");
    }
    return job.outputPath;
  }
}
