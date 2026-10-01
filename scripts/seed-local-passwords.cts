// ============================================================
// KOVA — Seed local (email+password) credentials for demo users
// Idempotent: only sets passwordHash when it is currently null.
// Run: node -r ts-node/register/transpile-only scripts/seed-local-passwords.cts
// ============================================================

import { db } from '../src/prisma/db';
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';

const TARGETS: Array<{ email: string; password: string; role: 'BUYER' | 'SELLER' }> = [
  { email: 'kova.buyer1@kova.dev', password: 'KovaDemo!2026', role: 'BUYER' },
  { email: 'kova.seller1@kova.dev', password: 'KovaDemo!2026', role: 'SELLER' },
];

async function main() {
  for (const t of TARGETS) {
    const user = await db.orm.public.User.where({ email: t.email }).first();
    if (!user) {
      console.log(`SKIP (not found): ${t.email}`);
      continue;
    }
    if (user.passwordHash) {
      console.log(`SKIP (already has password): ${t.email}`);
      continue;
    }
    const hash = await bcrypt.hash(t.password, 10);
    await db.orm.public.User.where({ id: user.id }).update({
      passwordHash: hash,
      role: t.role,
    });
    console.log(`OK: local password set for ${t.email} (${t.role})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => db.close());
