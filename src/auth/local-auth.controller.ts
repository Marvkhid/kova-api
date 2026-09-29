// ============================================================
// KOVA API — Local Auth Controller
// Routes (all under the global /api prefix):
//   POST /api/auth/register  → create buyer or seller account
//                              (sellers get their own shop in
//                              the same transaction)
//   POST /api/auth/login     → sign in, receive JWT
//   GET  /api/auth/me        → current user (Bearer JWT)
// ============================================================

import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { LocalAuthService, RegisterDto, LoginDto } from './local-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(1, { message: 'Reset token is missing' })
  token!: string;
  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password!: string;
}

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
      emailVerified: !!user.emailVerifiedAt,
    };
  }

  // ── Email verification ──────────────────────────────────

  /** Link target from the verification email. */
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.localAuth.verifyEmail(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: any) {
    return this.localAuth.resendVerification(user.id);
  }

  // ── Password reset ──────────────────────────────────────

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.localAuth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.localAuth.resetPassword(dto.token, dto.password);
  }
}
