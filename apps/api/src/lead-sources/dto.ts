import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
} from "class-validator";
import { LeadSourceType } from "@inmoflow/db";

export class CreateLeadSourceDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsEnum(LeadSourceType)
  type!: LeadSourceType;

  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() metaPageId?: string;
  @IsOptional() @IsString() metaFormId?: string;
  @IsOptional() @IsString() webFormKey?: string;
}

export class UpdateLeadSourceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() metaPageId?: string;
  @IsOptional() @IsString() metaFormId?: string;
  @IsOptional() @IsString() webFormKey?: string;
}
