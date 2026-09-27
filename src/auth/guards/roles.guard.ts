// ============================================================
// KOVA API — Role-based authorization
// @Roles('SELLER', 'ADMIN') on a controller/handler. Must run
// AFTER JwtAuthGuard so request.user is populated.
// ============================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type Role = 'BUYER' | 'SELLER' | 'ADMIN';

export const ROLES_KEY = 'kova_roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do that');
    }
    return true;
  }
}
