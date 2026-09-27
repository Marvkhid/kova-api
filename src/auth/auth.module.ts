// ============================================================
// KOVA API — Auth Module
// Session verification via the official Clerk SDK + role guard,
// plus the first-party email+password auth path (LocalAuthService).
// ============================================================

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LocalAuthService } from './local-auth.service';
import { LocalAuthController } from './local-auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';

// Global: JwtAuthGuard is applied with @UseGuards(ClassRef) across many
// feature modules; Nest instantiates it in the *consuming* module's
// context, so AuthService must be resolvable app-wide, not just where
// AuthModule is imported.
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [LocalAuthController],
  providers: [AuthService, LocalAuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, LocalAuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
