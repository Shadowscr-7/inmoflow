import { IsString, IsOptional, IsArray, IsUUID } from "class-validator";

export class CreateTagDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class AssignTagsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds!: string[];
}
