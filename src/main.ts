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

  // CORS - allow requests from the KOVA frontends (localhost dev +
  // Vercel production). Extra origins via EXTRA_ORIGINS (comma-separated).
  const corsOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'https://kova-shopp.vercel.app',
    ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',') : []),
  ].filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,});

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
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 KOVA API running on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start KOVA API:', err);
  process.exit(1);
});
