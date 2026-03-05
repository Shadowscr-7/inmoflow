import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { LeadStatus } from "@inmoflow/db";

export class CreateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;

  /** At least one contact field is enforced at service level */
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() stageKey?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() intent?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() stageKey?: string;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() intent?: string;
  @IsOptional() @IsNumber() @Min(0) score?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateStageDto {
  @IsString() @MaxLength(50) key!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateStageDto {
  @IsOptional() @IsString() @MaxLength(50) key?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class ReorderStagesDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
