// ============================================================
// KOVA API — Users Service
// User creation/sync from Clerk, profile updates, role handling.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';

// ── DTOs ──────────────────────────────────────────────────

export class FindOrCreateUserDto {
  clerkId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

export class UpdateEmailDto {
  @IsEmail() email: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Find existing user or create from Clerk data (idempotent)
  async findOrCreate(dto: FindOrCreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { clerkId: dto.clerkId },
    });
    if (existing) return existing;

    return this.prisma.user.upsert({
      where: { email: dto.email },
      update: { clerkId: dto.clerkId },
      create: {
        clerkId: dto.clerkId,
        email: dto.email,
        name: dto.name ?? null,
        avatarUrl: dto.avatarUrl ?? null,
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

  /** Non-throwing variant used by the auth flow. */
  async findByClerkIdOrNull(clerkId: string) {
    return this.prisma.user.findUnique({
      where: { clerkId },
      include: { sellerProfile: true },
    });
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

  // ── Admin helpers (used by the admin module) ─────────────

  async listUsers(limit = 50, offset = 0) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { sellerProfile: { select: { storeName: true, storeSlug: true } } },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total };
  }

  async countByRole() {
    const grouped = await this.prisma.user.groupBy({ by: ['role'], _count: true });
    const result = { BUYER: 0, SELLER: 0, ADMIN: 0 };
    for (const g of grouped) result[g.role] = g._count;
    return result;
  }
}
