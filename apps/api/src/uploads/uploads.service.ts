import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface UploadedFileResult {
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");
    this.baseUrl = process.env.UPLOAD_BASE_URL ?? "/api/uploads/files";
  }

  async saveFile(tenantId: string, file: Express.Multer.File): Promise<UploadedFileResult> {
    const tenantDir = path.join(this.uploadDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    // Generate unique filename to avoid collisions
    const ext = path.extname(file.originalname);
    const hash = crypto.randomBytes(16).toString("hex");
    const safeFilename = `${hash}${ext}`;

    const filePath = path.join(tenantDir, safeFilename);
    fs.writeFileSync(filePath, file.buffer);

    this.logger.log(`File saved: ${tenantId}/${safeFilename} (${file.originalname}, ${file.size} bytes)`);

    return {
      url: `${this.baseUrl}/${tenantId}/${safeFilename}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Resolve a relative upload URL to an absolute file path.
   */
  resolveFilePath(relativePath: string): string | null {
    // Expected format: /api/uploads/files/{tenantId}/{filename}
    const match = relativePath.match(/\/api\/uploads\/files\/([^/]+)\/([^/]+)$/);
    if (!match) return null;

    const [, tenantId, filename] = match;
    // Prevent path traversal
    if (tenantId.includes("..") || filename.includes("..")) return null;

    const filePath = path.join(this.uploadDir, tenantId, filename);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Get the absolute URL for an upload, given the request host.
   */
  getAbsoluteUrl(relativeUrl: string, host: string, protocol = "https"): string {
    return `${protocol}://${host}${relativeUrl}`;
  }
}
