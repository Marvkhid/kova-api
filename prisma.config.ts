// ============================================================
// KOVA API — Prisma 8 config
// Reads the existing Prisma 7 schema (prisma/schema.prisma) as
// the Prisma 8 contract via prisma7Schema(...). The database,
// its data, and the connection string are unchanged.
// ============================================================

import 'dotenv/config';
import { definePrismaConfig, } from 'prisma/config';
import { defineConfig as definePostgresConfig, prisma7Schema } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
  orm: definePostgresConfig({
    contract: prisma7Schema('prisma/schema.prisma'),
    output: 'src/generated/prisma8',
    db: {
      connection: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
    },
  }),
});
