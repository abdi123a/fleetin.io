/**
 * Give every shipper and transporter a mark.
 *
 * Most companies in the book have no logo on file, so every board that names
 * one fell back to grey initials — and a page where three companies out of
 * twenty-five have a mark reads as broken rather than as sparse. This writes a
 * real asset for each of them.
 *
 * ## What it draws
 *
 * A **letterform mark**, not a picture: a filled disc with the company's own
 * word or monogram on it. Two reasons it is letters.
 *
 * First, these avatars are 24–44px. A pictorial logo at 24px is a smudge; a
 * short word or a two-letter monogram is still legible, which is the entire
 * job of a mark in a list.
 *
 * Second, an invented pictogram would be a *claim* about a real company's
 * identity. Letters drawn from the company's own name are a stand-in that
 * cannot be mistaken for the real thing, and the moment somebody uploads the
 * genuine logo through `POST /shippers/:id/logo` it replaces this with no code
 * change — `logoKey` is the same column either way.
 *
 * ## Fitting the circle
 *
 * The artwork is a **full-bleed square**, not a disc, and that is deliberate.
 * The avatar frame is `overflow-hidden` and is `rounded-full` in most places
 * (row cards, consoles, mission cards) but `rounded-md` in the Shippers and
 * Partners directories. A disc fits the round frame and leaves grey corners in
 * the square one; a square fills the square frame and is *clipped* to a perfect
 * circle by the round one. One asset, correct in both.
 *
 * The letters are held inside the **inscribed** circle so the clip never cuts
 * them: the widest mark runs to 94 of 128 units, and the circle's chord across
 * the text band is about 121.
 *
 * They are also centred and pinned to an explicit `textLength`, so a mark
 * occupies exactly the width it was designed for **whatever font the viewer's
 * machine has** — an SVG rendered inside an `<img>` gets no webfont and no CSS
 * from the page, and without `textLength` a wide fallback face would push a
 * six-letter word straight through the clip.
 *
 *     pnpm ts-node prisma/generate-company-logos.ts          # only those missing one
 *     pnpm ts-node prisma/generate-company-logos.ts --all    # redraw every generated mark
 *
 * Never overwrites a real uploaded logo: a `logoKey` this script did not write
 * is left alone even under `--all`.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { assertSeedTargetIsSafe } from './seed-target-guard';

/** Marks this script wrote, so `--all` can redraw them without touching real uploads. */
const GENERATED_MARKER = 'company-mark';

/**
 * The mark each company wears.
 *
 * Written out rather than derived, because the derivation that works for
 * "Somtel Distribution SARL" (take the first word) produces "RED SEA" for
 * *two* different companies and "AL" for Al-Baraka. Twenty-five companies is
 * small enough to decide by hand, and the fallback below covers anything added
 * later.
 *
 * The mix is deliberate: a short distinctive word where the name has one
 * ("SOMTEL", "AWASH", "NAGAD"), initials where it does not or where a word
 * would collide with another company's ("RSC" and "RSF" are both Red Sea).
 */
const MARKS: Record<string, string> = {
  /* Shippers */
  'CMA CGM': 'CMA',
  'Promising LTD': 'PROMIS',
  'Greentech SARL': 'GREEN',
  'LS FZCO': 'LS',
  'GL FZCO': 'GL',
  'Amina FZCO': 'AMINA',
  'Diamond Shipping Services': 'DIAMOND',
  'Saba Shipping': 'SABA',

  /* Transporters */
  'GEMINI': 'GEMINI',
  'Massida Logistics': 'MASSIDA',
  'Transit Marill': 'MARILL',
  'MTI Logistics': 'MTI',
  'Freight Secure Logistics & Services': 'FSLS',
  'J.J. Kothari Logistics': 'JJK',
  'East West Transport': 'EW',
  'Trans Nomadia': 'NOMADIA',
  'Move One Djibouti': 'MOVE1',
  'Dita Transit': 'DITA',
};

/** Words that describe a legal form or a trade, never the company itself. */
const NOISE = new Set([
  'ltd', 'llc', 'plc', 'sarl', 'sc', 'fze', 'fzco', 'co', 'coop', 'company',
  'group', 'holding', 'holdings', 'international', 'trading', 'transport',
  'transit', 'logistics', 'freight', 'carriers', 'lines', 'haulage', 'express',
  'services', 'solutions', 'distribution', 'commodities', 'industries',
  'import', 'imports', 'cargo', 'container', 'containers', 'and', 'the', 'el', 'al',
]);

/**
 * The mark for a company the table above does not name.
 *
 * A short distinctive word if the name offers one, otherwise the initials of
 * up to three meaningful words. Six characters is the ceiling because that is
 * roughly where a word stops being readable inside a 24px circle.
 */
function deriveMark(name: string): string {
  const words = name
    .replace(/[^A-Za-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((word) => !NOISE.has(word.toLowerCase()));

  const first = words[0];
  if (first && first.length >= 3 && first.length <= 6) return first.toUpperCase();

  const initials = words.slice(0, 3).map((word) => word.charAt(0)).join('').toUpperCase();
  if (initials.length >= 2) return initials;

  return name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '??';
}

/**
 * Ten deep tones, each carrying white text at 5:1 or better.
 *
 * Not the application palette. These are *content* — a company's mark stands in
 * for its brand the same way the real CMA-CGM artwork does, and forcing every
 * company onto Fleetin's own teal would make twenty-five different businesses
 * look like twenty-five departments of one. Assigned by position in a stable
 * ordering rather than by hashing the name, so the set spreads evenly and no
 * two companies next to each other in a list share a colour.
 */
const PALETTE = [
  '#1F5C6B', // deep teal
  '#B4531F', // burnt orange
  '#2D4A7A', // navy
  '#6B2D5C', // plum
  '#1E6B4A', // forest
  '#8A2B2B', // brick
  '#4A4A6B', // slate violet
  '#7A5C1F', // ochre
  '#2B6B8A', // steel blue
  '#5C3A1F', // umber
];

/**
 * How big the letters are, and how wide they are allowed to run.
 *
 * `textLength` is the load-bearing part. The SVG is loaded through an `<img>`,
 * which means no webfont and no CSS from the page — whatever face the viewer's
 * OS supplies is what draws. Pinning the advance width makes the mark occupy
 * the same span on every machine instead of overflowing the disc wherever the
 * fallback font happens to be wide.
 */
function typeFor(mark: string): { fontSize: number; textLength: number } {
  switch (mark.length) {
    case 1:
    case 2:
      return { fontSize: 54, textLength: 58 };
    case 3:
      return { fontSize: 42, textLength: 78 };
    case 4:
      return { fontSize: 34, textLength: 86 };
    case 5:
      return { fontSize: 29, textLength: 90 };
    default:
      return { fontSize: 24, textLength: 94 };
  }
}

/** A generic stack — the SVG gets no webfont inside an `<img>`, so it must ask for what exists. */
const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function buildSvg(name: string, mark: string, colour: string): string {
  const { fontSize, textLength } = typeFor(mark);
  const label = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* Full-bleed square — the frame decides the silhouette, and it is the frame
     that clips. See the note at the top of this file. */
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="${label}">
  <title>${label}</title>
  <rect width="128" height="128" fill="${colour}"/>
  <text x="64" y="65" text-anchor="middle" dominant-baseline="central"
        font-family="${FONT_STACK}" font-size="${fontSize}" font-weight="700"
        letter-spacing="0.5" textLength="${textLength}" lengthAdjust="spacingAndGlyphs"
        fill="#FFFFFF">${mark}</text>
</svg>
`;
}

/** `Bab el Mandeb Logistics FZE` → `bab-el-mandeb-logistics-fze`. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main(): Promise<void> {
  assertSeedTargetIsSafe('generate-company-logos');
  const redrawAll = process.argv.includes('--all');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const storage = app.get(StorageService);

  try {
    const [shippers, partners] = await Promise.all([
      prisma.shipper.findMany({
        where: { deletedAt: null },
        select: { id: true, reference: true, companyLegalName: true, logoKey: true },
        orderBy: { reference: 'asc' },
      }),
      prisma.partner.findMany({
        where: { deletedAt: null },
        select: { id: true, reference: true, companyLegalName: true, logoKey: true },
        orderBy: { reference: 'asc' },
      }),
    ]);

    const companies = [
      ...shippers.map((row) => ({ ...row, kind: 'shipper' as const })),
      ...partners.map((row) => ({ ...row, kind: 'partner' as const })),
    ];

    let written = 0;
    let keptReal = 0;
    let skipped = 0;

    for (const [index, company] of companies.entries()) {
      const isGenerated = Boolean(company.logoKey?.includes(GENERATED_MARKER));

      /* A real uploaded logo outranks anything drawn here, always. The one
         company that already had genuine brand artwork is the reason `--all`
         is not simply "overwrite everything". */
      if (company.logoKey && !isGenerated) {
        keptReal += 1;
        continue;
      }
      if (isGenerated && !redrawAll) {
        skipped += 1;
        continue;
      }

      const mark = MARKS[company.companyLegalName] ?? deriveMark(company.companyLegalName);
      const colour = PALETTE[index % PALETTE.length]!;
      const svg = buildSvg(company.companyLegalName, mark, colour);
      const filename = `${GENERATED_MARKER}-${slug(company.companyLegalName)}.svg`;

      const stored = await storage.upload(
        {
          originalname: filename,
          buffer: Buffer.from(svg, 'utf8'),
          mimetype: 'image/svg+xml',
          size: Buffer.byteLength(svg, 'utf8'),
        },
        { folder: 'logos', preserveFilename: true },
      );

      if (company.kind === 'shipper') {
        await prisma.shipper.update({ where: { id: company.id }, data: { logoKey: stored.key } });
      } else {
        await prisma.partner.update({ where: { id: company.id }, data: { logoKey: stored.key } });
      }

      console.log(`  ${company.reference.padEnd(8)} ${mark.padEnd(7)} ${colour}  ${company.companyLegalName}`);
      written += 1;
    }

    console.log(
      `\n🎨 ${written} mark(s) written · ${keptReal} real logo(s) left alone · ${skipped} already drawn` +
        (skipped > 0 && !redrawAll ? ' (use --all to redraw)' : ''),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('❌ Logo generation failed:', error);
  process.exit(1);
});
