import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProfileDto } from "./dto";

export interface JwtPayload {
  sub: string; // userId
  tenantId: string | null;
  email: string;
  role: string;
  type?: "access" | "refresh";
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId ?? null,
      email: user.email,
      role: user.role,
    };

    const accessPayload: JwtPayload = { ...payload, type: "access" };
    const refreshPayload: JwtPayload = { ...payload, type: "refresh" };

    return {
      access_token: this.jwt.sign(accessPayload),
      refresh_token: this.jwt.sign(refreshPayload, { expiresIn: "7d" }),
      user: {
        id: user.id,
        tenantId: user.tenantId ?? null,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwt.verify<JwtPayload>(refreshToken);
      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }

      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, isActive: true },
      });
      if (!user) throw new UnauthorizedException("User not found");

      const newPayload: JwtPayload = {
        sub: user.id,
        tenantId: user.tenantId ?? null,
        email: user.email,
        role: user.role,
        type: "access",
      };

      return {
        access_token: this.jwt.sign(newPayload),
      };
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const data: { name?: string; passwordHash?: string } = {};

    if (dto.name !== undefined) data.name = dto.name;

    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException("La contraseña actual es requerida");
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) {
        throw new BadRequestException("La contraseña actual es incorrecta");
      }
      data.passwordHash = await this.hashPassword(dto.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    return updated;
  }
}
