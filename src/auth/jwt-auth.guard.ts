// ============================================================
// KOVA API — JWT Auth Guard
// Extracted from auth.module.ts so auth/index.ts can import it
// without triggering the circular require (auth.module.ts → users
// service → auth/index → auth.module.ts).
// ============================================================

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

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
