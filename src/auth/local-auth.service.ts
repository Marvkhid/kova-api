// ============================================================
// KOVA API — Local Email + Password Auth Service (Prisma 8)
// A first-party alternative/parallel path to Clerk sign-in.
//   • register: creates a real user (bcrypt-hashed password),
//     optionally with their own seller shop (unique slug) in
//     the same transaction
//   • login: verifies credentials, returns a signed HS256 JWT
//     (7d, signed with the existing JWT_SECRET)
//   • me: returns the synced database user
// Users live in the same `users` table as Clerk users; local
// accounts use clerkId "local:<email>" so the rest of the
// marketplace (products, stores, orders) works unchanged.
// ============================================================

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { db, now } from '../prisma/db';
import { AuthTokensService } from './auth-tokens.service';
import { MailerService } from './mailer.service';

// ── DTOs ──────────────────────────────────────────────────

export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(80)
  name!: string;

  /** "BUYER" (default) or "SELLER" — sellers get their own shop. */
  @IsOptional()
  @IsString()
  role?: 'BUYER' | 'SELLER';

  /** Required when role=SELLER — becomes the public shop name. */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Store name must be at least 3 characters' })
  @MaxLength(60)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  storeDescription?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}

// ── Service ───────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

@Injectable()
export class LocalAuthService {
  constructor(
    private jwt: JwtService,
    private tokens: AuthTokensService,
    private mailer: MailerService,
  ) {}

  /** Deterministic, URL-safe, unique store slug with numeric suffix fallback. */
  private async uniqueStoreSlug(storeName: string): Promise<string> {
    const base =
      storeName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'shop';

    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const taken = await db.orm.public.SellerProfile
        .where({ storeSlug: candidate })
        .select('id')
        .first();
      if (!taken) return candidate;
    }
    // Practically unreachable; last resort with random suffix.
    return `${base}-${Math.floor(Math.random() * 100000)}`;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const role = dto.role === 'SELLER' ? 'SELLER' : 'BUYER';

    if (role === 'SELLER' && !dto.storeName) {
      throw new ConflictException('Store name is required for seller accounts');
    }

    const existing = await db.orm.public.User.where({ email }).first();
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists — try logging in instead',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const storeName = role === 'SELLER' ? dto.storeName!.trim() : null;

    // User + shop created atomically.
    const user = await db.transaction(async (tx) => {
      const created = await tx.orm.public.User.create({
        clerkId: `local:${email}`,
        email,
        passwordHash,
        name: dto.name.trim(),
        role,
      });

      if (role === 'SELLER' && storeName) {
        const storeSlug = await this.uniqueStoreSlug(storeName);
        await tx.orm.public.SellerProfile.create({
          userId: created.id,
          storeName,
          storeSlug,
          description: dto.storeDescription?.trim() || null,
        });
      }

      return created;
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await db.orm.public.User.where({ email }).first();

    if (!user || !user.passwordHash) {
      // Same message for both cases — do not leak which emails exist.
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  // ── Email verification ────────────────────────────────────

  async verifyEmail(token: string) {
    const { userId } = await this.tokens.consume(token, 'EMAIL_VERIFY');
    const user = await db.orm.public.User
      .where({ id: userId })
      .update({ emailVerifiedAt: now() });
    return { verified: true, email: user!.email };
  }

  async resendVerification(userId: string) {
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new UnauthorizedException('Account not found');
    if (user.emailVerifiedAt) {
      return { sent: false, message: 'Email is already verified' };
    }
    const token = await this.tokens.issue(user.id, 'EMAIL_VERIFY');
    const delivered = await this.mailer.sendEmailVerification(user.email, token);
    return { sent: true, delivered };
  }

  // ── Password reset ────────────────────────────────────────

  /** Always returns { sent: true } — never reveals which emails exist. */
  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await db.orm.public.User.where({ email: normalized }).first();
    if (!user || !user.passwordHash) return { sent: true };
    const token = await this.tokens.issue(user.id, 'PASSWORD_RESET');
    const delivered = await this.mailer.sendPasswordReset(user.email, token);
    return { sent: true, delivered };
  }

  async resetPassword(token: string, password: string) {
    const { userId } = await this.tokens.consume(token, 'PASSWORD_RESET');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.orm.public.User.where({ id: userId }).update({ passwordHash });
    return { reset: true };
  }

  /** Called by the guard for `local:` users on every request — no DB hit. */
  verifyLocalToken(token: string): { sub: string; email: string; provider: string } | null {
    try {
      const payload = this.jwt.verify(token);
      if (payload?.provider !== 'local' || !payload?.sub) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    role: string;
  }) {
    const full = await db.orm.public.User
      .include('sellerProfile')
      .where({ id: user.id })
      .first();

    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      provider: 'local',
    });

    return {
      token,
      user: {
        id: full!.id,
        email: full!.email,
        name: full!.name,
        role: full!.role,
        avatarUrl: full!.avatarUrl,
        sellerProfile: full!.sellerProfile,
      },
    };
  }
}
