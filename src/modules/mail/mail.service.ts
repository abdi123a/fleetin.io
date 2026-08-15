import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.get<string>('EMAIL_FROM', 'FLEETIN System <noreply@fleetin.com>');

    if (apiKey && apiKey !== 're_123456789') {
      this.resend = new Resend(apiKey);
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.warn(`[DEV MAIL LOG] To: ${to} | Subject: "${subject}" (Resend API Key not configured)`);
      return { id: 'dev-mock-id' };
    }

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html,
      });
      this.logger.log(`Email successfully sent to ${to} (ID: ${response.data?.id})`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
