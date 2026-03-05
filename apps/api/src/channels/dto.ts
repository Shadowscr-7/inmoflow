import { IsString, IsOptional, IsEnum, IsNotEmpty } from "class-validator";
import { ChannelType, MessageChannel } from "@inmoflow/db";

export class CreateChannelDto {
  @IsEnum(ChannelType) type!: ChannelType;
}

export class SendMessageDto {
  @IsString() @IsNotEmpty() content!: string;
  @IsOptional() @IsEnum(MessageChannel) channel?: MessageChannel;
}
