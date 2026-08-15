import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';

/**
 * HTML → PDF, on the server.
 *
 * Deliberately not in the browser: the preview and the issued file have to
 * come from the same template on the same machine, or they drift the first
 * time a font or a print stylesheet differs between two operators' laptops.
 *
 * One Chromium instance is shared across requests and closed on shutdown.
 * Launching per document costs ~300 ms and this module issues documents in
 * bursts at month-end.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async render(html: string, options: { landscape?: boolean } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      /* `networkidle0` would hang forever: the document is self-contained and
       * issues no requests, so there is no network to go idle. */
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      this.browser = browser;
      this.launching = null;
      this.logger.log('Chromium started for document rendering');
      return browser;
    })();

    return this.launching;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
