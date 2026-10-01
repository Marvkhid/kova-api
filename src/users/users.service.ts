// ============================================================
// KOVA API — Users Service (Prisma 8)
// User creation/sync from Clerk, profile updates, role handling.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { db } from '../prisma/db';

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
  // Find existing user or create from Clerk data (idempotent)
  async findOrCreate(dto: FindOrCreateUserDto) {
    const existing = await db.orm.public.User
      .where({ clerkId: dto.clerkId })
      .first();
    if (existing) return existing;

    const byEmail = await db.orm.public.User.where({ email: dto.email }).first();
    if (byEmail) {
      return db.orm.public.User.where({ id: byEmail.id }).update({ clerkId: dto.clerkId });
    }

    return db.orm.public.User.create({
      clerkId: dto.clerkId,
      email: dto.email,
      name: dto.name ?? null,
      avatarUrl: dto.avatarUrl ?? null,
    });
  }

  async findById(id: string) {
    const user = await db.orm.public.User
      .include('sellerProfile')
      .where({ id })
      .first();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByClerkId(clerkId: string) {
    const user = await db.orm.public.User
      .include('sellerProfile')
      .where({ clerkId })
      .first();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Non-throwing variant used by the auth flow. */
  async findByClerkIdOrNull(clerkId: string) {
    return db.orm.public.User.include('sellerProfile').where({ clerkId }).first();
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return db.orm.public.User.where({ id }).update(dto);
  }

  // Get user's order history
  async getOrders(userId: string) {
    return db.orm.public.Order
      .include('items', (items: any) => items.include('product'))
      .where({ userId })
      .orderBy((o) => o.createdAt.desc())
      .all();
  }

  // ── Admin helpers (used by the admin module) ─────────────

  async listUsers(limit = 50, offset = 0) {
    const [users, totalAgg] = await Promise.all([
      db.orm.public.User
        .include('sellerProfile', (sp: any) => sp.select('storeName', 'storeSlug'))
        .orderBy((u) => u.createdAt.desc())
        .offset(offset)
        .limit(limit)
        .all(),
      db.orm.public.User.aggregate((a) => ({ total: a.count() })),
    ]);
    return { users, total: Number(totalAgg.total) };
  }

  async countByRole() {
    const grouped = await db.orm.public.User
      .groupBy('role')
      .aggregate((a) => ({ count: a.count() }));
    const result = { BUYER: 0, SELLER: 0, ADMIN: 0 } as Record<string, number>;
    for (const g of grouped) result[g.role] = Number(g.count);
    return result;
  }
}
