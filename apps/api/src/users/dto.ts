import { IsString, IsOptional, IsEmail, IsEnum, IsNotEmpty, IsBoolean, MinLength, Matches } from "class-validator";
import { UserRole } from "@inmoflow/db";

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "La contraseña debe incluir mayúscula, minúscula y número",
  })
  password!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  /** Only ADMIN can set this to create users in a specific tenant */
  @IsOptional() @IsString() tenantId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional()
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "La contraseña debe incluir mayúscula, minúscula y número",
  })
  password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
