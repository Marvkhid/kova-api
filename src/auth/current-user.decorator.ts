// ============================================================
// KOVA API — CurrentUser decorator
// MUST live in its own file with no imports that reach
// users.service.ts. Placing it here breaks the circular require
// chain: auth.module.ts → users.service.ts → auth/index →
// auth.module.ts (or clerk-jwt.strategy → users.service).
//
// Consumers: import { CurrentUser } from '../auth/current-user
// .decorator';
// ============================================================

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
