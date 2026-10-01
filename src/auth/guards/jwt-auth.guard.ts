// ============================================================
// KOVA API — Auth Guard
// Dual-mode bearer-token verification:
//   1. Local JWTs (HS256, signed with JWT_SECRET, provider=local)
//      — from /api/auth/login + /api/auth/register.
//   2. Clerk session tokens (ES256) — verified with the official
//      Clerk SDK and synced to Postgres.
// Both attach the SAME database user shape to request.user, so
// every downstream module works identically.
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';
import { LocalAuthService } from '../local-auth.service';
import { db } from '../../prisma/db';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private localAuth: LocalAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length).trim();

    // ── Path 1: local HS256 JWT (provider=local) ────────────
    const local = this.localAuth.verifyLocalToken(token);
    if (local) {
      const user = await db.orm.public.User
        .include('sellerProfile')
        .where({ id: local.sub })
        .first();
      if (!user) throw new UnauthorizedException('Account no longer exists');
      request.user = user;
      return true;
    }

    // ── Path 2: Clerk session token (ES256 via JWKS) ────────
    const user = await this.auth.verifySession(token);
    request.user = user;
    return true;
  }
}
