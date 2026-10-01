// ============================================================
// KOVA API — Auth Tokens Service (Prisma 8)
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
import { db, now } from '../prisma/db';

export type AuthTokenType = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

const TTL: Record<AuthTokenType, number> = {
  EMAIL_VERIFY: 24 * 60 * 60 * 1000, // 24h
  PASSWORD_RESET: 60 * 60 * 1000, // 1h
};

@Injectable()
export class AuthTokensService {
  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Issue a fresh token, invalidating any previous one of this type. */
  async issue(userId: string, type: AuthTokenType): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await db.orm.public.AuthToken.where({ userId, type }).delete();
    await db.orm.public.AuthToken.create({
      userId,
      type,
      tokenHash: this.hash(raw),
      expiresAt: Temporal.PlainDateTime.from(
        new Date(Date.now() + TTL[type]).toISOString().replace(/\.\d+Z$/, ''),
      ),
    });
    return raw;
  }

  /** Validate + consume. Throws when invalid/expired/already used. */
  async consume(token: string, type: AuthTokenType): Promise<{ userId: string }> {
    const row = await db.orm.public.AuthToken
      .where({ tokenHash: this.hash(token) })
      .first();

    if (!row || row.type !== type) {
      throw new BadRequestException('This link is invalid or has already been used');
    }
    if (row.usedAt) {
      throw new BadRequestException('This link has already been used');
    }
    // Naive `timestamp` column → PlainDateTime; interpret as local wall-clock
    // (matching how the token was written from UTC now + TTL).
    if (Date.parse(`${row.expiresAt.toString()}Z`) < Date.now()) {
      throw new BadRequestException('This link has expired — request a new one');
    }

    await db.orm.public.AuthToken.where({ id: row.id }).update({ usedAt: now() });
    // Prevent token-reuse across types with the same hash material
    await db.orm.public.AuthToken.where({ userId: row.userId, type }).delete();
    return { userId: row.userId };
  }
}
