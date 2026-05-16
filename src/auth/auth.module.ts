// ============================================================
// KOVA API — Auth Module
// Verifies Clerk JWT tokens on protected routes.
// ============================================================

import {
  Module,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.module';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';

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

// ── Auth Guard ────────────────────────────────────────────

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth = request.headers.authorization;

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    // Passport handles the rest via strategy
    return true;
  }
}

// ── Current User Decorator ────────────────────────────────
// Use @CurrentUser() in any controller to get the logged-in user

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

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
