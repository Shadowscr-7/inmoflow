import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PropertiesService } from "../properties/properties.service";
import { TtsService, SubtitleChunk } from "./tts.service";
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
  audioPath: string | null;
  error: string | null;
  createdAt: number;
}

interface StartReelInput {
  agentName: string;
  agentPhone: string;
  voiceGender: "female" | "male";
}

@Injectable()
export class ReelVideoService {
  private readonly logger = new Logger(ReelVideoService.name);
  private readonly uploadDir: string;
  private readonly outputDir: string;
  private readonly jobs = new Map<string, ReelJob>();

  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly ttsService: TtsService,
  ) {
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

  getAudioPath(jobId: string): string | null {
    const job = this.jobs.get(jobId);
    if (!job?.audioPath) return null;
    return fs.existsSync(job.audioPath) ? job.audioPath : null;
  }

  async startReel(
    tenantId: string,
    propertyId: string,
    input: StartReelInput,
  ): Promise<ReelJob> {
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
      audioPath: null,
      error: null,
      createdAt: Date.now(),
    };
    this.jobs.set(jobId, job);

    const apiPort = process.env.API_PORT ?? "4000";

    // Build HTTP-accessible image URLs for Remotion's Chromium
    const photoUrls: string[] = [];
    if (property.media) {
      for (const m of property.media.filter((x) => x.kind === "image")) {
        if (m.url.startsWith("http://") || m.url.startsWith("https://")) {
          photoUrls.push(m.url);
        } else if (m.url.startsWith("/api/uploads/")) {
          photoUrls.push(`http://localhost:${apiPort}${m.url}`);
        }
      }
    }

    const priceStr = property.price
      ? `${property.currency ?? "USD"} ${property.price.toLocaleString("es")}`
      : "Consultar";

    const narrationScript = this.buildNarrationScript(property);

    const baseInputProps = {
      photos: photoUrls,
      price: priceStr,
      address: property.address ?? property.zone ?? "",
      operationType: (property.operationType ?? "sale") as "sale" | "rent",
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      areaM2: property.areaM2,
      hasGarage: property.hasGarage ?? false,
      agentName: input.agentName,
      agentPhone: input.agentPhone,
      voiceGender: input.voiceGender,
      audioUrl: null as string | null,
      subtitleChunks: [] as SubtitleChunk[],
    };

    this.renderInBackground(job, baseInputProps, narrationScript, apiPort).catch((err) => {
      this.logger.error(`Reel render failed for job ${jobId}`, err);
    });

    return job;
  }

  private buildNarrationScript(property: {
    title: string;
    description?: string | null;
    operationType?: string | null;
    propertyType?: string | null;
    address?: string | null;
    zone?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    areaM2?: number | null;
    hasGarage?: boolean | null;
    price?: number | null;
    currency?: string | null;
    amenities?: string | null;
  }): string {
    const parts: string[] = [];
    const opType = property.operationType === "rent" ? "alquiler" : "venta";
    const location = property.address ?? property.zone ?? "";

    parts.push(`¡Oportunidad de ${opType}!`);

    if (property.description && property.description.trim().length > 20) {
      let desc = property.description.replace(/\n+/g, ". ").replace(/\s+/g, " ").trim();
      if (desc.length > 400) {
        desc = desc.slice(0, 400);
        const lastSpace = desc.lastIndexOf(" ");
        if (lastSpace > 200) desc = desc.slice(0, lastSpace);
        if (!desc.endsWith(".")) desc += ".";
      }
      parts.push(desc);
    } else {
      const typeStr = property.propertyType ?? "Propiedad";
      parts.push(`${typeStr}${location ? ` en ${location}` : ""}.`);
    }

    const features: string[] = [];
    if (property.bedrooms) {
      features.push(`${property.bedrooms} dormitorio${property.bedrooms !== 1 ? "s" : ""}`);
    }
    if (property.bathrooms) {
      features.push(`${property.bathrooms} baño${property.bathrooms !== 1 ? "s" : ""}`);
    }
    if (property.areaM2) {
      features.push(`${property.areaM2} metros cuadrados`);
    }
    if (property.hasGarage) {
      features.push("garage incluido");
    }

    if (features.length > 0) {
      if (features.length === 1) {
        parts.push(`Cuenta con ${features[0]}.`);
      } else {
        const last = features.pop()!;
        parts.push(`Cuenta con ${features.join(", ")} y ${last}.`);
      }
    }

    if (property.price) {
      const priceStr = property.price.toLocaleString("es");
      parts.push(`Precio: ${property.currency ?? "USD"} ${priceStr}.`);
    } else {
      parts.push("Precio a consultar.");
    }

    parts.push("¡Contactanos para más información y no te pierdas esta oportunidad única!");

    return parts.join(" ");
  }

  private async renderInBackground(
    job: ReelJob,
    baseInputProps: Record<string, unknown>,
    narrationScript: string,
    apiPort: string,
  ): Promise<void> {
    try {
      job.status = "bundling";
      job.progress = 3;

      // 1. Generate TTS audio (non-blocking failure)
      const ttsResult = await this.ttsService.generate(
        narrationScript,
        (baseInputProps.voiceGender as "female" | "male") ?? "female",
        this.outputDir,
        job.id,
      );

      let audioUrl: string | null = null;
      let subtitleChunks: SubtitleChunk[] = [];

      if (ttsResult) {
        job.audioPath = ttsResult.audioPath;
        audioUrl = `http://localhost:${apiPort}/api/reel-video-internal/${job.id}/audio`;
        subtitleChunks = ttsResult.subtitleChunks;
      }

      job.progress = 15;

      // Dynamic imports to avoid loading Remotion at startup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { bundle } = require("@remotion/bundler");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { renderMedia, selectComposition } = require("@remotion/renderer");

      const browserExecutable =
        process.env.REMOTION_CHROME_EXECUTABLE ||
        process.env.CHROME_PATH ||
        undefined;

      const photos = baseInputProps.photos as string[];
      const entryPoint = path.resolve(process.cwd(), "../../video/src/index.ts");

      const bundleLocation = await bundle({
        entryPoint,
        onProgress: (progress: number) => {
          job.progress = 15 + Math.round((progress / 100) * 20); // 15–35%
        },
      });

      job.status = "rendering";
      job.progress = 35;

      const fps = 30;
      const SLIDE_DUR = 120; // 4s per slide
      const TRANS = 18;      // 0.6s overlap transition
      const CONTACT_DUR = 120; // 4s contact screen
      const photoCount = Math.max(photos.length, 1);
      const totalDuration = photoCount * SLIDE_DUR + TRANS + CONTACT_DUR;

      const inputProps = {
        ...baseInputProps,
        audioUrl,
        subtitleChunks,
      };

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "PropertyReelV2",
        inputProps,
        browserExecutable,
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
      });

      composition.durationInFrames = totalDuration;
      composition.fps = fps;

      const outputPath = path.join(this.outputDir, `reel_${job.id}.mp4`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: outputPath,
        inputProps,
        browserExecutable,
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
        onProgress: ({ progress }: { progress: number }) => {
          job.progress = 35 + Math.round(progress * 65); // 35–100%
        },
      });

      job.status = "done";
      job.progress = 100;
      job.outputPath = outputPath;

      this.logger.log(`Reel rendered: ${outputPath}`);
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
