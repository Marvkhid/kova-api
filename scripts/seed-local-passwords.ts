// ============================================================
// KOVA — Seed local (email+password) credentials for demo users
// Idempotent: only sets passwordHash when it is currently null.
// Run: npx ts-node scripts/seed-local-passwords.ts
// ============================================================

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TARGETS: Array<{ email: string; password: string; role: 'BUYER' | 'SELLER' }> = [
  { email: 'kova.buyer1@kova.dev', password: 'KovaDemo!2026', role: 'BUYER' },
  { email: 'kova.seller1@kova.dev', password: 'KovaDemo!2026', role: 'SELLER' },
];

async function main() {
  for (const t of TARGETS) {
    const user = await prisma.user.findUnique({ where: { email: t.email } });
    if (!user) {
      console.log(`SKIP (not found): ${t.email}`);
      continue;
    }
    if (user.passwordHash) {
      console.log(`SKIP (already has password): ${t.email}`);
      continue;
    }
    const hash = await bcrypt.hash(t.password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, role: t.role },
    });
    console.log(`OK: local password set for ${t.email} (${t.role})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
