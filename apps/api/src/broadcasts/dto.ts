import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsIn } from "class-validator";
import { BroadcastItemStatus } from "@inmoflow/db";

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  type!: string; // "PRICE_CHANGE" | "ANNOUNCEMENT"

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  autoApproveStageIds?: string[];

  @IsOptional()
  @IsBoolean()
  autoSend?: boolean;

  // Leads source: either sourceId (LeadSource) or explicit leadIds
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadIds?: string[];
}

export class UpdateItemsDto {
  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];

  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";
}

export class SendBatchDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[]; // if omitted, send all APPROVED items
}
