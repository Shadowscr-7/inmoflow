import {
  Controller, Post, Body, UseGuards, BadRequestException, PayloadTooLargeException,
} from "@nestjs/common";
import { ImportService } from "./import.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";
import { IsString, IsOptional, MaxLength, IsObject } from "class-validator";

/** Max CSV size: 2 MB */
const MAX_CSV_SIZE = 2 * 1024 * 1024;

class CsvPreviewDto {
  @IsString()
  @MaxLength(MAX_CSV_SIZE)
  csv!: string;
}

class CsvImportDto {
  @IsString()
  @MaxLength(MAX_CSV_SIZE)
  csv!: string;

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  sourceId?: string;
}

@Controller("import")
@UseGuards(JwtAuthGuard, TenantGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post("preview")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  preview(@Body() dto: CsvPreviewDto) {
    if (dto.csv.length > MAX_CSV_SIZE) throw new PayloadTooLargeException("CSV too large (max 2 MB)");
    return this.importService.preview(dto.csv);
  }

  @Post("leads")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  importLeads(
    @TenantId() tenantId: string,
    @Body() dto: CsvImportDto,
  ) {
    if (dto.csv.length > MAX_CSV_SIZE) throw new PayloadTooLargeException("CSV too large (max 2 MB)");
    return this.importService.importLeads(tenantId, dto.csv, dto.mapping, dto.sourceId);
  }
}
