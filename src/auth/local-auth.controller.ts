// ============================================================
// KOVA API — Local Auth Controller
// Routes (all under the global /api prefix):
//   POST /api/auth/register  → create buyer or seller account
//                              (sellers get their own shop in
//                              the same transaction)
//   POST /api/auth/login     → sign in, receive JWT
//   GET  /api/auth/me        → current user (Bearer JWT)
// ============================================================

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LocalAuthService, RegisterDto, LoginDto } from './local-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class LocalAuthController {
  constructor(private localAuth: LocalAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.localAuth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.localAuth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      sellerProfile: user.sellerProfile,
    };
  }
}
