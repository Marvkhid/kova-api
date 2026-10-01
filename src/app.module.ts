// ============================================================
// KOVA API — App Module
// ============================================================

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { SellersModule } from './sellers/sellers.module';
import { CartModule } from './cart/cart.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaystackModule } from './paystack/paystack.module';
import { CategoriesModule } from './categories/categories.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    SellersModule,
    CartModule,
    UploadsModule,
    ReviewsModule,
    PaystackModule,
    CategoriesModule,
    WishlistModule,
    AdminModule,
  ],
})
export class AppModule {}
