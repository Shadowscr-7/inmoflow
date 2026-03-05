import { IsString, IsOptional, IsBoolean, IsInt, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class StepDto {
  @IsInt()
  order!: number;

  @IsInt()
  delayHours!: number;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsString()
  content!: string;
}

export class CreateSequenceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];
}

export class UpdateSequenceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps?: StepDto[];
}
