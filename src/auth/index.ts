// ============================================================
// KOVA API — Auth exports
// IMPORTANT: CurrentUser must be defined HERE, not re-exported from
// auth.module.ts. auth.module.ts requires users.service.ts at its
// top level, and users.service.ts requires this barrel, which would
// create a circular require where auth.module.js's exports.CurrentUser
// (assigned at line 62) is not yet set when users.service.js reads it.
// Defining CurrentUser in this file breaks the cycle.
// JwtAuthGuard + ClerkJwtStrategy are safe to re-export because no
// module requires them at top level before auth.module.js finishes.
// ============================================================

// IMPORTANT: require current-user.decorator FIRST so that when
// clerk-jwt.strategy.ts triggers the circular require of this barrel
// (via users.service.ts), CurrentUser is already assigned.
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';

export { JwtAuthGuard, ClerkJwtStrategy, CurrentUser };
