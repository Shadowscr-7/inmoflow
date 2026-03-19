import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { MessageChannel } from "@inmoflow/db";

export class TemplateAttachmentDto {
  @IsString() url!: string;
  @IsString() originalName!: string;
  @IsString() mimeType!: string;
  @IsOptional() size?: number;
}

export class CreateTemplateDto {
  @IsString() @IsNotEmpty() key!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel;
  @IsString() @IsNotEmpty() content!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateAttachmentDto)
  attachments?: TemplateAttachmentDto[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** If true and user is BUSINESS/ADMIN, creates a global (tenant-wide) template */
  @IsOptional() @IsBoolean() global?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel | null;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateAttachmentDto)
  attachments?: TemplateAttachmentDto[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() global?: boolean;
}
