// ============================================================
// KOVA API — Auth Tokens Service
// Issues and consumes one-time, hashed, expiring tokens for
// email verification and password reset.
//   • Raw token: 32 random bytes, base64url — shown only in
//     the email link, never persisted.
//   • Storage: SHA-256 hash of the raw token (unique index).
//   • Single-use: consumption marks usedAt (and deletes the
//     user's other outstanding tokens of the same type).
// ============================================================

import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';

export type AuthTokenType = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

const TTL: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000, // 24h
  PASSWORD_RESET: 60 * 60 * 1000, // 1h
};

@Injectable()
export class AuthTokensService {
  constructor(private prisma: PrismaService) {}

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Issue a fresh token, invalidating any previous one of this type. */
  async issue(userId: string, type: AuthTokenType): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.authToken.deleteMany({ where: { userId, type } });
    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + TTL[type]),
      },
    });
    return raw;
  }

  /** Validate + consume. Throws when invalid/expired/already used. */
  async consume(token: string, type: AuthTokenType): Promise<{ userId: string }> {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });

    if (!row || row.type !== type) {
      throw new BadRequestException('This link is invalid or has already been used');
    }
    if (row.usedAt) {
      throw new BadRequestException('This link has already been used');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This link has expired — request a new one');
    }

    await this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    // Prevent token-reuse across types with the same hash material
    await this.prisma.authToken.deleteMany({ where: { userId: row.userId, type } });
    return { userId: row.userId };
  }
}
