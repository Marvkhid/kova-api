// ============================================================
// KOVA API — Auth Service
// Verifies Clerk session tokens (ES256) with the official
// @clerk/backend verifyToken() and syncs users to Postgres.
// ============================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken, createClerkClient } from '@clerk/clerk-sdk-node';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private config: ConfigService,
    private users: UsersService,
  ) {}

  /** Verify a Clerk session token and return the synced database user. */
  async verifySession(token: string) {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      throw new UnauthorizedException('Server authentication is not configured');
    }
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let clerkId: string;
    try {
      // Official verification: signature + expiry via Clerk JWKS
      const payload = await verifyToken(token, { secretKey });
      clerkId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    // Fast path: already synced
    const existing = await this.users.findByClerkIdOrNull(clerkId);
    if (existing) return existing;

    // First request from this user — enrich from the Clerk Backend API
    try {
      const clerk = createClerkClient({ secretKey });
      const clerkUser = await clerk.users.getUser(clerkId);
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress;

      if (!email) throw new UnauthorizedException('Clerk account has no email');

      return await this.users.findOrCreate({
        clerkId,
        email,
        name:
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
          undefined,
        avatarUrl: clerkUser.imageUrl || undefined,
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Could not verify your account');
    }
  }
}
