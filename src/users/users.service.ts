// ============================================================
// KOVA API — Users Service + Module
// Handles user creation, profile, sync from Clerk.
// ============================================================

import { Injectable, NotFoundException, Module } from '@nestjs/common';
import { IsString, IsEmail, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';

// ── DTOs ──────────────────────────────────────────────────

export class FindOrCreateUserDto {
  clerkId: string;
  email: string;
  name?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Find existing user or create from Clerk data
  async findOrCreate(dto: FindOrCreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { clerkId: dto.clerkId },
    });

    if (existing) return existing;

    return this.prisma.user.create({
      data: {
        clerkId: dto.clerkId,
        email: dto.email,
        name: dto.name ?? null,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { sellerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByClerkId(clerkId: string) {
    const user = await this.prisma.user.findUnique({
      where: { clerkId },
      include: { sellerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  // Get user's order history
  async getOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

// ── Controller ────────────────────────────────────────────

import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.module';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  // GET /api/users/me — get current user profile
  @Get('me')
  async getMe(@CurrentUser() user: any) {
    return this.users.findById(user.id);
  }

  // PATCH /api/users/me — update profile
  @Patch('me')
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  // GET /api/users/me/orders — get order history
  @Get('me/orders')
  async getMyOrders(@CurrentUser() user: any) {
    return this.users.getOrders(user.id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
