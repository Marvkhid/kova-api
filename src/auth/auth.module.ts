// ============================================================
// KOVA API — Auth Module
// Verifies Clerk JWT tokens on protected routes.
// ============================================================

import { Module, Injectable } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// ── JWT Payload from Clerk ────────────────────────────────

export interface ClerkJwtPayload {
  sub: string; // Clerk user ID
  email: string;
  name?: string;
}

// ── JWT Strategy ──────────────────────────────────────────

@Injectable()
export class ClerkJwtStrategy extends PassportStrategy(Strategy, 'clerk-jwt') {
  constructor(
    private config: ConfigService,
    private users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: ClerkJwtPayload) {
    // Find or create user in our DB from Clerk token
    const user = await this.users.findOrCreate({
      clerkId: payload.sub,
      email: payload.email,
      name: payload.name,
    });
    return user;
  }
}

// ── Auth Module ───────────────────────────────────────────

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'clerk-jwt' }),
    UsersModule,
  ],
  providers: [ClerkJwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, ClerkJwtStrategy],
})
export class AuthModule {}