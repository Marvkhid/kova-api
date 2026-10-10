// ============================================================
// KOVA API — Auth Module
// Verifies Clerk JWT tokens on protected routes.
// ============================================================

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { UsersModule } from '../users/users.module';

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

// Backwards-compat re-exports for any consumer still importing from
// `../auth/auth.module` directly. New code should use `../auth/index`.
export { JwtAuthGuard, ClerkJwtStrategy } from './index';
