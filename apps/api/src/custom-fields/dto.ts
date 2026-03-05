import { IsString, IsOptional, IsBoolean, IsEnum, IsArray, IsInt } from "class-validator";
import { CustomFieldType } from "@inmoflow/db";

export class CreateCustomFieldDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(CustomFieldType)
  fieldType?: CustomFieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class SetFieldValueDto {
  @IsString()
  definitionId!: string;

  @IsString()
  value!: string;
}

export class SetFieldValuesDto {
  @IsArray()
  values!: SetFieldValueDto[];
}
