// ============================================================
// KOVA API — App Module (Final)
// ============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { SellersModule } from './sellers/sellers.module';
import { CartModule } from './cart/cart.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaystackModule } from './paystack/paystack.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    SellersModule,
    CartModule,
    UploadsModule,
    ReviewsModule,
    PaystackModule,
  ],
})
export class AppModule {}
