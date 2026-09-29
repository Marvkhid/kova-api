// ============================================================
// KOVA API — Users Controller
// GET    /api/users/me          — current user (with role + sellerProfile)
// PATCH  /api/users/me          — update profile
// GET    /api/users/me/orders   — order history
// DELETE /api/users/me          — permanently delete the account
// ============================================================

import { Controller, Delete, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService, UpdateProfileDto } from './users.service';
import { AdminService } from '../admin/admin.module';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private users: UsersService,
    private admin: AdminService,
  ) {}

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

  // DELETE /api/users/me — permanently delete the account and everything
  // tied to it (store, products, listings, wishlist, tokens). Admins must
  // not self-delete here — deletion of admin accounts is a console task.
  @Delete('me')
  async deleteMe(@CurrentUser() user: any) {
    return this.admin.deleteUserCompletely(user.id);
  }
}
