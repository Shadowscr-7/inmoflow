import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsNotEmpty,
  IsIn,
  Min,
  Max,
  MaxLength,
} from "class-validator";

const VALID_PROVIDERS = ["OPENAI", "GEMINI", "CLAUDE", "GROK", "DEEPSEEK", "QWEN"];

export class CreateAiConfigDto {
  @IsIn(VALID_PROVIDERS)
  provider!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(32000)
  maxTokens?: number;
}

export class UpdateAiConfigDto {
  @IsOptional()
  @IsIn(VALID_PROVIDERS)
  provider?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  systemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(64)
  @Max(32000)
  maxTokens?: number;
}

export class TestAiDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message!: string;

  @IsOptional()
  history?: Array<{ role: string; content: string }>;
}
