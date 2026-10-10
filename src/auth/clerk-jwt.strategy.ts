// ============================================================
// KOVA API — Clerk JWT Strategy
// Extracted from auth.module.ts so auth/index.ts can import it
// without triggering the circular require (auth.module.ts → users
// service → auth/index → auth.module.ts).
// ============================================================

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.module';
import { UsersService } from '../users/users.service';

export interface ClerkJwtPayload {
  sub: string; // Clerk user ID
  email: string;
  name?: string;
}

@Injectable()
export class ClerkJwtStrategy extends PassportStrategy(Strategy, 'clerk-jwt') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
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
