// ============================================================
// KOVA API — Paystack Module
// Initialize payment + handle webhook confirmation.
// ============================================================

import {
  Injectable,
  Module,
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  RawBodyRequest,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { OrdersService } from '../orders/orders.module';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.module';
import type { Request } from 'express';

// ── DTOs ──────────────────────────────────────────────────

export class InitializePaymentDto {
  @IsString() orderId: string;
  @IsString() email: string;
  @IsNumber() @Min(1) @Type(() => Number) amount: number; // in kobo (NGN) or cents
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class PaystackService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private orders: OrdersService,
  ) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
  }

  // Initialize a payment — returns authorization URL
  async initializePayment(dto: InitializePaymentDto, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
    });
    if (!order) throw new BadRequestException('Order not found');

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: dto.email,
        amount: Math.round(order.total * 100), // convert to kobo
        reference: `kova-${order.id}-${Date.now()}`,
        metadata: { orderId: order.id, userId },
        callback_url: `${this.config.get('FRONTEND_URL')}/orders?ref={FLWREF}`,
      }),
    });

    const data = (await response.json()) as any;
    if (!data.status) throw new BadRequestException(data.message);

    return {
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code,
    };
  }

  // Verify payment by reference
  async verifyPayment(reference: string) {
    const response = await fetch(
      `${this.baseUrl}/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );

    const data = (await response.json()) as any;
    if (!data.status || data.data.status !== 'success') {
      throw new BadRequestException('Payment verification failed');
    }

    const { orderId } = data.data.metadata;
    return this.orders.confirmPayment(orderId, reference);
  }

  // Validate Paystack webhook signature
  validateWebhookSignature(payload: string, signature: string): boolean {
    const hash = createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }

  // Handle incoming Paystack webhook
  async handleWebhook(event: any, rawBody: string, signature: string) {
    // Validate signature
    if (!this.validateWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.event) {
      case 'charge.success': {
        const { reference, metadata } = event.data;
        if (metadata?.orderId) {
          await this.orders.confirmPayment(metadata.orderId, reference);
        }
        break;
      }
      case 'refund.processed': {
        const { metadata } = event.data;
        if (metadata?.orderId) {
          await this.prisma.order.update({
            where: { id: metadata.orderId },
            data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' },
          });
        }
        break;
      }
    }

    return { received: true };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('payments')
export class PaystackController {
  constructor(private paystack: PaystackService) {}

  // POST /api/payments/initialize — start payment
  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  initialize(@CurrentUser() user: any, @Body() dto: InitializePaymentDto) {
    return this.paystack.initializePayment(dto, user.id);
  }

  // GET /api/payments/verify/:reference — verify after redirect
  @Get('verify/:reference')
  @UseGuards(JwtAuthGuard)
  verify(@Param('reference') reference: string) {
    return this.paystack.verifyPayment(reference);
  }

  // POST /api/payments/webhook — Paystack webhook (no auth)
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
    @Body() event: any,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(event);
    return this.paystack.handleWebhook(event, rawBody, signature);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  imports: [],
  providers: [PaystackService],
  controllers: [PaystackController],
  exports: [PaystackService],
})
export class PaystackModule {}
