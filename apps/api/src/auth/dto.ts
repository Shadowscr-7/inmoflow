import { IsEmail, IsString, IsNotEmpty, IsOptional, MinLength, Matches } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "La contraseña debe tener mayúscula, minúscula y número",
  })
  password?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}
