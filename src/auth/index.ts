// ============================================================
// KOVA API — Auth exports
// Single source of truth for what AuthModule exposes to other
// modules via `exports: [JwtAuthGuard, ClerkJwtStrategy]`.
// Import these here rather than reaching into auth.module.ts
// so the decorator is a stable, tree-shakeable reference.
// ============================================================

import { JwtAuthGuard, ClerkJwtStrategy, CurrentUser } from './auth.module';

export { JwtAuthGuard, ClerkJwtStrategy, CurrentUser };
