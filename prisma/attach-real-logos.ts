/**
 * Put each company's real logo on its record.
 *
 * `generate-company-logos.ts` draws a letterform stand-in for a company that
 * has no artwork on file. This is the other half: the account has supplied the
 * genuine marks, and a real logo beats a drawn monogram everywhere one exists.
 *
 * The mapping is by **legal name**, matched case- and space-insensitively
 * against the filename, because that is the only key the two sides share — the
 * folder has `Amina FZCO.jpeg`, the database has `Amina FZCO`, and nothing
 * carries an id in common. A file that matches nothing, and a company that gets
 * no file, are both reported rather than passed over: a silent miss here shows
 * up as grey initials on a board weeks later, with nothing to explain it.
 *
 * ## One company, two roles
 *
 * CMA CGM is a shipper in this book *and* a shipping line, and it is one
 * business either way — the same name, the same artwork. So its file is
 * attached to the shipper record and copied into the frontend's shipping-line
 * assets under the same name. The logo registry is keyed by lowercased legal
 * name (`features/companies/companyLogos.ts`), so both roles resolve to the
 * one mark rather than to two versions of it that could drift apart.
 *
 *     pnpm ts-node prisma/attach-real-logos.ts [--dir <folder>]
 *
 * Idempotent: re-running replaces the stored object and repoints `logoKey`.
 */
import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { assertSeedTargetIsSafe } from './seed-target-guard';

/**
 * The squared marks, not the raw artwork.
 *
 * `prisma/tools/normalise-logos.py` trims each supplied logo's own white
 * border and re-pads it to a square, because these are drawn into round
 * frames 24–44px across and a wide rectangle with a baked-in margin lands in
 * one as a speck. Point `--dir` at the original folder to attach the raw files
 * instead.
 */
const DEFAULT_DIR = resolve(__dirname, 'data/logos');

/**
 * Where the frontend keeps the marks for things the API has no table for.
 *
 * A shipping line is not an account in Fleetin — it is a name printed on a box
 * — so there is no `logoKey` column to hang its artwork off. The list lives in
 * the browser (`features/shipping-lines/shippingLines.ts`) and its default
 * marks are static assets, which is what this folder holds.
 */
const FRONTEND_LINE_ASSETS = resolve(
  __dirname,
  '../../fleetin design system/public/shipping-lines',
);

/** The six carriers that cover the boxes moving through this corridor. */
const SHIPPING_LINES = [
  'MSC',
  'CMA CGM',
  'Maersk Line',
  'COSCO Shipping Lines',
  'Pacific International Lines (PIL)',
  'Hapag-Lloyd',
];

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

/** Match on letters and digits alone — spacing and punctuation differ either side. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A filesystem-safe slug for the frontend asset, e.g. `cma-cgm.png`. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  assertSeedTargetIsSafe('attach-real-logos.ts');

  const dirFlag = process.argv.indexOf('--dir');
  const dir = dirFlag !== -1 ? process.argv[dirFlag + 1]! : DEFAULT_DIR;
  if (!existsSync(dir)) throw new Error(`Logo folder not found: ${dir}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);

  try {
    const files = readdirSync(dir).filter((name) => MIME_BY_EXT[extname(name).toLowerCase()]);
    const byKey = new Map(files.map((name) => [key(basename(name, extname(name))), join(dir, name)]));

    const [shippers, partners] = await Promise.all([
      prisma.shipper.findMany({ where: { deletedAt: null }, select: { id: true, companyLegalName: true } }),
      prisma.partner.findMany({ where: { deletedAt: null }, select: { id: true, companyLegalName: true } }),
    ]);

    const used = new Set<string>();
    const missing: string[] = [];
    let attached = 0;

    const attach = async (
      kind: 'shipper' | 'partner',
      row: { id: string; companyLegalName: string },
    ): Promise<void> => {
      const path = byKey.get(key(row.companyLegalName));
      if (!path) {
        missing.push(`${row.companyLegalName} (${kind})`);
        return;
      }
      used.add(key(row.companyLegalName));
      const buffer = readFileSync(path);
      const stored = await storage.upload(
        {
          originalname: `${slug(row.companyLegalName)}${extname(path).toLowerCase()}`,
          buffer,
          mimetype: MIME_BY_EXT[extname(path).toLowerCase()]!,
          size: buffer.byteLength,
        },
        { folder: 'logos', preserveFilename: true },
      );
      if (kind === 'shipper') {
        await prisma.shipper.update({ where: { id: row.id }, data: { logoKey: stored.key } });
      } else {
        await prisma.partner.update({ where: { id: row.id }, data: { logoKey: stored.key } });
      }
      attached += 1;
      console.log(`   ✓ ${row.companyLegalName} → ${stored.key}`);
    };

    console.log(`🖼  Attaching real logos from ${dir}`);
    for (const row of shippers) await attach('shipper', row);
    for (const row of partners) await attach('partner', row);

    /* A shipping line has no database row to carry a `logoKey`, so its mark is
     * a static asset the browser list points at. Same source file, same name —
     * CMA CGM's mark is written once here and read by both its roles. */
    mkdirSync(FRONTEND_LINE_ASSETS, { recursive: true });
    let lines = 0;
    for (const line of SHIPPING_LINES) {
      const path = byKey.get(key(line));
      if (!path) {
        missing.push(`${line} (shipping line)`);
        continue;
      }
      used.add(key(line));
      copyFileSync(path, join(FRONTEND_LINE_ASSETS, `${slug(line)}${extname(path).toLowerCase()}`));
      lines += 1;
    }
    console.log(`   ✓ ${lines} shipping-line marks copied to public/shipping-lines`);

    const unmatched = files.filter((name) => !used.has(key(basename(name, extname(name)))));
    console.log(`\n🖼  ${attached} company logos attached, ${lines} shipping lines`);
    if (missing.length > 0) console.log(`   ⚠️  no artwork supplied for: ${missing.join(', ')}`);
    if (unmatched.length > 0) console.log(`   ⚠️  file matched no company: ${unmatched.join(', ')}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('❌ Logo attach failed:', error);
  process.exit(1);
});
