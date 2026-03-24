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

    // Collect HTTP-accessible image URLs for Remotion's browser
    const apiPort = process.env.API_PORT ?? "4000";
    const photoUrls: string[] = [];
    if (property.media) {
      for (const m of property.media.filter((x) => x.kind === "image")) {
        if (m.url.startsWith("http://") || m.url.startsWith("https://")) {
          // External URL (e.g. MercadoLibre) — use directly
          photoUrls.push(m.url);
        } else if (m.url.startsWith("/api/uploads/")) {
          // Local upload — make it HTTP accessible via the API
          photoUrls.push(`http://localhost:${apiPort}${m.url}`);
        }
      }
    }

    // Format price
    const priceStr = property.price
      ? `${property.currency ?? "USD"} ${property.price.toLocaleString("es")}`
      : "Consultar";

    // Build input props for Remotion
    const inputProps = {
      photos: photoUrls, // HTTP URLs accessible by Chromium
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

      // Use system Chromium on Alpine Linux
      const browserExecutable =
        process.env.REMOTION_CHROME_EXECUTABLE ||
        process.env.CHROME_PATH ||
        undefined;

      // Photos are already HTTP URLs, use directly
      const photos = inputProps.photos as string[];

      const entryPoint = path.resolve(process.cwd(), "../../video/src/index.ts");
      job.progress = 10;

      const bundleLocation = await bundle({
        entryPoint,
        onProgress: (progress: number) => {
          job.progress = 10 + Math.round((progress / 100) * 20); // 10-30%
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
        browserExecutable,
        chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
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
        browserExecutable,
        chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
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
