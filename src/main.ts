// ============================================================
// KOVA API — Main Entry Point
// ============================================================

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix — all routes start with /api
  app.setGlobalPrefix('api');

  // CORS — allow requests from Next.js frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://kova-wgcb.vercel.app',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global validation pipe — validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 KOVA API running on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start KOVA API:', err);
  process.exit(1);
});
