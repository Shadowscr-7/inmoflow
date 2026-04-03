import { IsString, IsOptional, IsEnum, IsDateString, IsUUID, IsBoolean } from "class-validator";
import { VisitStatus } from "@inmoflow/db";

export class CreateVisitDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  // Fields for auto-creating a new lead when leadId is not provided
  @IsOptional()
  @IsString()
  newLeadName?: string;

  @IsOptional()
  @IsString()
  newLeadPhone?: string;

  @IsOptional()
  @IsString()
  newLeadEmail?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  sendWhatsappReminder?: boolean;
}

export class UpdateVisitDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
