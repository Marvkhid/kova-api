// ============================================================
// KOVA API — Users Controller
// GET   /api/users/me          — current user (with role + sellerProfile)
// PATCH /api/users/me          — update profile
// GET   /api/users/me/orders   — order history
// ============================================================

import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService, UpdateProfileDto } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  // GET /api/users/me — get current user profile (password hash stripped)
  @Get('me')
  async getMe(@CurrentUser() user: any) {
    const full = await this.users.findById(user.id);
    const { passwordHash, ...safe } = full;
    return safe;
  }

  // PATCH /api/users/me — update profile
  @Patch('me')
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  // GET /api/users/me/orders — get order history
  @Get('me/orders')
  async getMyOrders(@CurrentUser() user: any) {
    return this.users.getOrders(user.id);
  }
}
