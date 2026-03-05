import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
} from "class-validator";
import { MessageChannel } from "@inmoflow/db";

export class CreateTemplateDto {
  @IsString() @IsNotEmpty() key!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel;
  @IsString() @IsNotEmpty() content!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** If true and user is BUSINESS/ADMIN, creates a global (tenant-wide) template */
  @IsOptional() @IsBoolean() global?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel | null;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() global?: boolean;
}
