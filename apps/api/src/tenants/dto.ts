import { IsString, IsOptional, IsNotEmpty, IsEnum } from "class-validator";
import { Plan } from "@inmoflow/db";

export class CreateTenantDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsEnum(Plan) plan?: Plan;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(Plan) plan?: Plan;
}
