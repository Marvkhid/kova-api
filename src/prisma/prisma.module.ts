// ============================================================
// KOVA API — Prisma Module + Service
// Global database access. Import PrismaModule anywhere.
// ============================================================

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Module,
  Global,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
