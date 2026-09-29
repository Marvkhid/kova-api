// ============================================================
// KOVA API — Mailer Service (Resend)
// Sends the transactional emails for the local auth system:
//   • email verification (on register / resend)
//   • password reset (on request)
// Uses RESEND_API_KEY + FROM_EMAIL from .env. When Resend is
// not configured (dev without keys) the email is logged to the
// API console instead of failing — verification links remain
// usable from the log.
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    this.from = this.config.get<string>('FROM_EMAIL') ?? 'onboarding@resend.dev';
    this.appUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(`RESEND not configured — email to ${to} not sent. Subject: ${subject}`);
      return false;
    }
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to, subject, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Resend ${res.status} for ${to}: ${body.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Resend request failed for ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  private wrap(title: string, bodyHtml: string, ctaText?: string, ctaUrl?: string): string {
    const cta =
      ctaText && ctaUrl
        ? `<a href="${ctaUrl}" style="display:inline-block;background:#E8622A;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:999px;margin:18px 0;">${ctaText}</a>`
        : '';
    return `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;background:#F5F0E8;padding:32px 24px;border-radius:16px;">
  <div style="font-size:22px;font-weight:800;color:#0D0D0D;margin-bottom:4px;">K<span style="color:#E8622A">O</span>VA</div>
  <h1 style="font-size:20px;color:#0D0D0D;margin:16px 0 8px;">${title}</h1>
  <div style="font-size:14px;color:#333333;line-height:1.6;">${bodyHtml}</div>
  ${cta}
  <p style="font-size:12px;color:#888888;margin-top:24px;">
    If the button does not work, copy this link into your browser:<br/>
    <span style="color:#E8622A;word-break:break-all;">${ctaUrl ?? ''}</span>
  </p>
</div>`;
  }

  async sendEmailVerification(to: string, token: string): Promise<boolean> {
    const url = `${this.appUrl}/verify-email?token=${token}`;
    return this.send(
      to,
      'Verify your KOVA email address',
      this.wrap(
        'Verify your email',
        '<p>Welcome to KOVA! Confirm this email address to activate your account.</p><p>This link expires in 24 hours.</p>',
        'Verify my email',
        url,
      ),
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<boolean> {
    const url = `${this.appUrl}/reset-password?token=${token}`;
    return this.send(
      to,
      'Reset your KOVA password',
      this.wrap(
        'Reset your password',
        '<p>We received a request to reset your KOVA password.</p><p>This link expires in 1 hour. If you did not request it, you can safely ignore this email.</p>',
        'Choose a new password',
        url,
      ),
    );
  }

  // ── Seller governance notifications ───────────────────────

  async sendSellerApproved(to: string, storeName: string): Promise<boolean> {
    const url = `${this.appUrl}/sellers/dashboard`;
    return this.send(
      to,
      'Your KOVA seller account is approved 🎉',
      this.wrap(
        'Seller account approved',
        `<p>Good news — <strong>${storeName}</strong> has been approved.</p>
         <p>You can now publish products and operate your store on Kova.
         Listings follow the marketplace moderation rules in the Seller Terms.</p>`,
        'Open your seller dashboard',
        url,
      ),
    );
  }

  async sendSellerRejected(to: string, storeName: string, reason?: string | null): Promise<boolean> {
    const url = `${this.appUrl}/sell`;
    const reasonHtml = reason
      ? `<p><strong>Reason:</strong> ${reason}</p>`
      : '<p>Your application requires additional information before approval.</p>';
    return this.send(
      to,
      'Your KOVA seller application',
      this.wrap(
        'Application status: changes needed',
        `<p>After reviewing <strong>${storeName}</strong>, we could not approve the application at this time.</p>
         ${reasonHtml}
         <p>You can update your seller profile and submit it for review again.</p>`,
        'Update my application',
        url,
      ),
    );
  }

  async sendSellerSuspended(to: string, storeName: string, reason?: string | null): Promise<boolean> {
    const reasonHtml = reason ? `<p><strong>Reason:</strong> ${reason}</p>` : '';
    return this.send(
      to,
      'Your KOVA seller account has been suspended',
      this.wrap(
        'Seller account suspended',
        `<p><strong>${storeName}</strong> has been suspended pending review.</p>
         ${reasonHtml}
         <p>Published listings are hidden from the marketplace while your account is suspended.
         Contact support for next steps.</p>`,
      ),
    );
  }
}
