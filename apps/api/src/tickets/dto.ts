import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { TicketStatus, TicketPriority } from "@inmoflow/db";

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class AddAttachmentsDto {
  @IsArray()
  attachments!: { url: string; filename: string; mimetype: string; size: number }[];
}
