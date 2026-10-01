// ============================================================
// KOVA API — Prisma 8 client
// Built from the contract files that `prisma contract emit`
// writes (src/generated/prisma8). Points at the same PostgreSQL
// database via DATABASE_URL.
// Prisma 8 returns DateTime columns as Temporal.Instant, so the
// polyfill is loaded first (Node 22/24 do not ship Temporal).
// ============================================================

import 'temporal-polyfill/full/global';
import 'temporal-spec/global';
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../generated/prisma8/contract';
import contractJson from '../generated/prisma8/contract.json';

// Prisma 8 returns naive `timestamp` columns as Temporal.PlainDateTime, whose
// toJSON omits the UTC designator. Prisma 5/7 serialized the same columns as
// UTC ISO strings ending in "Z" — restore that exact wire format so API
// consumers see no change.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Temporal as any).PlainDateTime.prototype.toJSON = function () {
  return `${this.toString()}Z`;
};

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';

export const db = postgres<Contract>({
  contractJson,
  url: connectionString,
});

export type Db = typeof db;

/**
 * Current timestamp as Temporal.PlainDateTime — the type Prisma 8's
 * `timestamp` columns expect for writes (v5/7 accepted `Date`).
 */
export function now(): Temporal.PlainDateTime {
  return Temporal.PlainDateTime.from(new Date().toISOString().replace(/\.\d+Z$/, ''));
}
