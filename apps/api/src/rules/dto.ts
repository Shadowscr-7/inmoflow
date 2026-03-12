import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsNotEmpty,
  IsArray,
  IsObject,
  ValidateNested,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

export class WorkingHoursScheduleDto {
  @IsNumber() day!: number; // 0=Sunday ... 6=Saturday
  @IsString() from!: string; // "HH:mm"
  @IsString() to!: string;   // "HH:mm"
}

export class WorkingHoursDto {
  @IsBoolean() enabled!: boolean;
  @IsString() timezone!: string; // e.g. "America/Argentina/Buenos_Aires"
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursScheduleDto)
  schedule!: WorkingHoursScheduleDto[];
}

const VALID_ACTION_TYPES = [
  "assign",
  "send_template",
  "change_status",
  "change_stage",
  "add_note",
  "notify",
  "send_ai_message",
  "wait",
];

const VALID_TRIGGERS = [
  "lead.created",
  "lead.updated",
  "lead.assigned",
  "lead.contacted",
  "message.inbound",
  "stage.changed",
  "no_response",
  "scheduled",
];

export class RuleActionDto {
  @IsIn(VALID_ACTION_TYPES)
  type!: string;

  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() templateKey?: string;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsNumber() delayMs?: number;
}

export class CreateRuleDto {
  @IsString() @IsNotEmpty() name!: string;

  @IsIn(VALID_TRIGGERS)
  trigger!: string;

  @IsOptional() @IsNumber() priority?: number;

  @IsObject() conditions!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions!: RuleActionDto[];

  @IsOptional() @IsBoolean() enabled?: boolean;
  /** If true and user is BUSINESS/ADMIN, creates a global (tenant-wide) rule */
  @IsOptional() @IsBoolean() global?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;
}

export class UpdateRuleDto {
  @IsOptional() @IsString() name?: string;

  @IsOptional()
  @IsIn(VALID_TRIGGERS)
  trigger?: string;

  @IsOptional() @IsNumber() priority?: number;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions?: RuleActionDto[];

  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() global?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;
}
