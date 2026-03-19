import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import { FilesInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard, TenantGuard } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { UploadsService } from "./uploads.service";
import * as fs from "fs";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg", "image/png", "image/gif", "image/webp",
  // Video
  "video/mp4", "video/webm", "video/quicktime",
  // Audio
  "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

@Controller("uploads")
@UseGuards(JwtAuthGuard, TenantGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor("files", MAX_FILES, {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async upload(
    @TenantId() tenantId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("No se proporcionaron archivos");
    }

    const results = await Promise.all(
      files.map((file) => this.uploads.saveFile(tenantId, file)),
    );

    return results;
  }

  /** Serve uploaded files publicly (no auth needed for delivery to messaging APIs) */
  @Get("files/:tenantId/:filename")
  serveFile(
    @Param("tenantId") tenantId: string,
    @Param("filename") filename: string,
    @Res() res: Response,
  ) {
    const filePath = this.uploads.resolveFilePath(`/api/uploads/files/${tenantId}/${filename}`);
    if (!filePath) {
      throw new NotFoundException("Archivo no encontrado");
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}
