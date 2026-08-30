/**
 * Attach a proof of delivery to every booking that has already been delivered.
 *
 * The volume seed writes the ladder and the timeline directly, so it produced
 * hundreds of bookings sitting at "POD Submitted" or "Completed" with no POD
 * file behind them. That is not a cosmetic gap: the POD is what the empty
 * return is gated on, so without it an operator cannot send a single container
 * home from the UI, and every delivered booking opens with an empty Proof of
 * Delivery panel.
 *
 * One delivery note is rendered per booking — from that booking's own recorded
 * facts, at its own `pod_upload` timestamp — so the file a reader opens says
 * the same thing as the timeline above it.
 *
 * Run:  npx ts-node prisma/seed-pods.ts        (add --reset to replace existing)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { assertSeedTargetIsSafe } from './seed-target-guard';

const prisma = new PrismaClient();

const STORAGE_ROOT = path.resolve(process.env.STORAGE_LOCAL_PATH ?? './uploads');
const POD_CATEGORY = 'Proof of Delivery';
const RESET = process.argv.includes('--reset');

/** Djibouti's working language for freight paperwork is French. */
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function frDateTime(value: Date): string {
  const d = value.getDate().toString().padStart(2, '0');
  const hh = value.getHours().toString().padStart(2, '0');
  const mm = value.getMinutes().toString().padStart(2, '0');
  return `${d} ${FR_MONTHS[value.getMonth()]} ${value.getFullYear()} · ${hh}:${mm}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/**
 * The signature.
 *
 * A generated squiggle gives away what it is — a row of even arcs no hand
 * produces. These write the signer's own name in a cursive face instead, which
 * is what a scanned delivery note actually shows, with the slant, size and
 * baseline offset varied per person so two notes never carry the same hand.
 */
const HANDS = [
  "'Snell Roundhand', 'Savoye LET', cursive",
  "'Brush Script MT', 'Brush Script', cursive",
  "'Bradley Hand', 'Noteworthy', cursive",
  "'Savoye LET', 'Snell Roundhand', cursive",
];

interface Hand {
  family: string;
  size: number;
  rotate: number;
  offsetX: number;
  offsetY: number;
}

/** Stable per name: the same person signs the same way on every note. */
function handFor(name: string): Hand {
  const seed = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const rand = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  return {
    family: HANDS[seed % HANDS.length]!,
    size: 25 + rand(1) * 9,
    rotate: -5 + rand(2) * 8,
    offsetX: 6 + rand(3) * 16,
    offsetY: rand(4) * 6 - 3,
  };
}

/**
 * How a signature is written by hand: given names shortened to initials, the
 * family name written out. "Djibril Ahmed Egueh" signs "D. A. Egueh".
 */
const HONORIFICS = ['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'm', 'm.', 'mme', 'mme.', 'eng', 'eng.'];

function signAs(name: string): string {
  /* Nobody initialises their own title — "Dr. Hassan Gouled" signs "H. Gouled". */
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((part, index) => !(index === 0 && HONORIFICS.includes(part.toLowerCase())));
  if (parts.length < 2) return name;
  const family = parts[parts.length - 1]!;
  const initials = parts.slice(0, -1).map((part) => `${part[0]!.toUpperCase()}.`);
  return `${initials.join(' ')} ${family}`;
}

interface NoteFacts {
  reference: string;
  shipmentReference: string;
  shipper: string;
  transporter: string;
  driver: string;
  vehicle: string;
  cargo: string;
  container: string | null;
  shippingLine: string | null;
  origin: string;
  destination: string;
  deliveredAt: Date;
  /** The person who signs for the cargo. */
  receivedBy: string;
  /** Their employer, printed under the signature line. */
  receivedFor: string;
}

function noteHtml(f: NoteFacts): string {
  const row = (label: string, value: string) => `
    <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;

  const handMarkup = (name: string) => {
    const hand = handFor(name);
    return `<span class="ink" style="font-family: ${hand.family}; font-size: ${hand.size.toFixed(1)}px;
      transform: rotate(${hand.rotate.toFixed(1)}deg) translate(${hand.offsetX.toFixed(0)}px, ${hand.offsetY.toFixed(0)}px);">${escapeHtml(
      signAs(name),
    )}</span>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A5 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #15201f;
           font-size: 11px; padding: 30px 34px; display: flex; flex-direction: column;
           min-height: 100vh; }
    .head { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #60969D; padding-bottom: 8px; }
    .brand { font-size: 21px; font-weight: 800; letter-spacing: 2px; color: #60969D; }
    .brand small { display: block; font-size: 8.5px; font-weight: 600; letter-spacing: .8px;
                   color: #6b7a78; margin-top: 2px; }
    .doc { text-align: right; }
    .doc b { font-size: 14px; letter-spacing: .6px; }
    .doc span { display: block; font-family: "Courier New", monospace; font-size: 10px; color: #4a5654; }
    h2 { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: #60969D;
         margin: 18px 0 7px; }
    table { width: 100%; border-collapse: collapse; }
    th { width: 118px; text-align: left; font-size: 9px; letter-spacing: .6px; text-transform: uppercase;
         color: #6b7a78; font-weight: 700; padding: 3.5px 0; vertical-align: top; }
    td { padding: 3.5px 0; font-weight: 600; }
    .cols { display: flex; gap: 26px; }
    .cols > div { flex: 1; }
    .sign { display: flex; gap: 34px; margin-top: auto; padding-top: 18px; }
    .sign > div { flex: 1; }
    .line { border-bottom: 1px solid #9aa8a6; height: 58px; position: relative; }
    .line .ink { position: absolute; bottom: 2px; left: 0; color: #1c3f5e;
                 transform-origin: left bottom; white-space: nowrap; }
    .cap { font-size: 9px; color: #6b7a78; margin-top: 3px; letter-spacing: .4px; }
    .stamp { margin-top: 14px; display: inline-block; align-self: flex-start; border: 2px solid #2e7d68; color: #2e7d68;
             padding: 5px 13px; border-radius: 4px; font-size: 11px; font-weight: 800;
             letter-spacing: 1.4px; transform: rotate(-3deg); }
    .foot { margin-top: 16px; border-top: 1px solid #dde3e2; padding-top: 8px;
            font-size: 8px; color: #8b9896; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="head">
      <div class="brand">FLEETIN<small>Logistics · Djibouti</small></div>
      <div class="doc">
        <b>BON DE LIVRAISON</b>
        <span>PROOF OF DELIVERY</span>
        <span>${escapeHtml(f.reference)}</span>
      </div>
    </div>

    <div class="cols">
      <div>
        <h2>Mission</h2>
        <table>
          ${row('Shipment', f.shipmentReference)}
          ${row('Shipper', f.shipper)}
          ${row('Cargo', f.cargo)}
          ${f.container ? row('Container', `${f.container}${f.shippingLine ? ` · ${f.shippingLine}` : ''}`) : ''}
        </table>
      </div>
      <div>
        <h2>Transport</h2>
        <table>
          ${row('Transporter', f.transporter)}
          ${row('Driver', f.driver)}
          ${row('Vehicle', f.vehicle)}
          ${row('Route', `${f.origin} → ${f.destination}`)}
        </table>
      </div>
    </div>

    <h2>Delivery</h2>
    <table>
      ${row('Delivered at', frDateTime(f.deliveredAt))}
      ${row('Place', f.destination)}
      ${row('Received by', `${f.receivedBy}${f.receivedFor ? ` · ${f.receivedFor}` : ''}`)}
    </table>
    <div class="stamp">REÇU / RECEIVED</div>

    <div class="sign">
      <div>
        <div class="line">${handMarkup(f.receivedBy)}</div>
        <div class="cap">Signature du client / Consignee — ${escapeHtml(f.receivedBy)}${
          f.receivedFor ? `, ${escapeHtml(f.receivedFor)}` : ''
        }</div>
      </div>
      <div>
        <div class="line">${handMarkup(f.driver)}</div>
        <div class="cap">Signature du chauffeur / Driver — ${escapeHtml(f.driver)}</div>
      </div>
    </div>

    <div class="foot">
      <span>Fleetin Logistics SARL · Route de Venise, Djibouti · +253 21 35 60 60</span>
      <span>${escapeHtml(f.reference)} · ${frDateTime(f.deliveredAt)}</span>
    </div>
  </body></html>`;
}

async function main() {
  // Refuse to touch anything but a local database — see seed-target-guard.ts.
  assertSeedTargetIsSafe('seed-pods.ts');

  const uploader = await prisma.user.findFirst({
    where: { email: 'admin@fleetin.com' },
    select: { id: true },
  });
  if (!uploader) throw new Error('No admin user — run the base seed first.');

  if (RESET) {
    const stale = await prisma.document.findMany({
      where: { ownerType: 'BOOKING', category: POD_CATEGORY },
      select: { id: true, storageKey: true },
    });
    for (const doc of stale) {
      await fs.rm(path.join(STORAGE_ROOT, doc.storageKey), { force: true });
    }
    await prisma.document.deleteMany({ where: { ownerType: 'BOOKING', category: POD_CATEGORY } });
    console.log(`· cleared ${stale.length} existing POD document(s)`);
  }

  /* Delivered means the timeline says so — the ladder alone would also catch
     bookings that were forced terminal without ever reaching a customer. */
  const delivered = (
    await prisma.bookingTimelineStep.findMany({
      where: { key: 'pod_upload', timestamp: { not: null } },
      select: { id: true, bookingId: true, timestamp: true },
    })
  ).map((step) => ({ id: step.id, bookingId: step.bookingId, occurredAt: step.timestamp! }));

  const alreadyHeld = new Set(
    (
      await prisma.document.findMany({
        where: { ownerType: 'BOOKING', category: POD_CATEGORY },
        select: { ownerId: true },
      })
    ).map((d) => d.ownerId),
  );

  const outstanding = delivered.filter((step) => !alreadyHeld.has(step.bookingId));
  console.log(
    `· ${delivered.length} delivered booking(s), ${alreadyHeld.size} already hold a POD, ${outstanding.length} to render`,
  );
  if (outstanding.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: outstanding.map((s) => s.bookingId) } },
    select: {
      id: true,
      reference: true,
      status: true,
      cargoType: true,
      containerNumber: true,
      shippingLine: true,
      partner: { select: { companyLegalName: true } },
      driver: { select: { fullName: true } },
      vehicle: { select: { plateNumber: true } },
      shipment: {
        select: {
          reference: true,
          shipperId: true,
          pickupLocationName: true,
          deliveryLocationName: true,
          shipper: { select: { companyLegalName: true } },
        },
      },
    },
  });
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  /* Who signs for the shipper. Real `Contact` rows — the primary one if the
     account has marked one, otherwise the first on file. A company does not
     sign a delivery note; a person at that company does. */
  const shipperIds = [...new Set(bookings.map((b) => b.shipment.shipperId).filter(Boolean))] as string[];
  const contacts = await prisma.contact.findMany({
    where: { ownerType: 'SHIPPER', ownerId: { in: shipperIds } },
    select: { ownerId: true, name: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  const signerByShipper = new Map<string, string>();
  for (const contact of contacts) {
    if (!signerByShipper.has(contact.ownerId)) signerByShipper.set(contact.ownerId, contact.name);
  }

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await fs.mkdir(path.join(STORAGE_ROOT, 'documents'), { recursive: true });

  let written = 0;
  for (const step of outstanding) {
    const booking = bookingById.get(step.bookingId);
    if (!booking) continue;

    const facts: NoteFacts = {
      reference: booking.reference,
      shipmentReference: booking.shipment.reference,
      shipper: booking.shipment.shipper?.companyLegalName ?? 'Shipper',
      transporter: booking.partner?.companyLegalName ?? 'Transporter',
      driver: booking.driver?.fullName ?? 'Driver',
      vehicle: booking.vehicle?.plateNumber ?? '—',
      cargo: booking.cargoType,
      container: booking.containerNumber,
      shippingLine: booking.shippingLine,
      origin: booking.shipment.pickupLocationName,
      destination: booking.shipment.deliveryLocationName,
      deliveredAt: step.occurredAt,
      receivedBy:
        signerByShipper.get(booking.shipment.shipperId) ??
        booking.shipment.shipper?.companyLegalName ??
        'Consignee',
      receivedFor: signerByShipper.has(booking.shipment.shipperId)
        ? (booking.shipment.shipper?.companyLegalName ?? '')
        : '',
    };

    await page.setContent(noteHtml(facts), { waitUntil: 'load' });
    const pdf = Buffer.from(await page.pdf({ format: 'A5', landscape: true, printBackground: true }));

    const key = `documents/${randomUUID()}.pdf`;
    await fs.writeFile(path.join(STORAGE_ROOT, key), pdf);

    /* The timeline's own POD step should point at the file, not just imply it. */
    await prisma.bookingTimelineStep.update({
      where: { id: step.id },
      data: { podFileUrl: `/uploads/${key}` },
    });

    await prisma.document.create({
      data: {
        ownerType: 'BOOKING',
        ownerId: booking.id,
        category: POD_CATEGORY,
        name: `POD-${booking.reference}.pdf`,
        storageKey: key,
        mimeType: 'application/pdf',
        fileSizeBytes: pdf.length,
        /* A closed booking's POD was checked on the way to closing it; one on
           a still-running booking has not been through that yet. */
        status: booking.status === 'Completed' ? 'Verified' : 'Pending',
        uploadedAt: step.occurredAt,
        uploadedById: uploader.id,
        verifiedById: booking.status === 'Completed' ? uploader.id : null,
        verifiedAt: booking.status === 'Completed' ? step.occurredAt : null,
        version: 1,
      },
    });

    written += 1;
    if (written % 100 === 0) console.log(`  … ${written}/${outstanding.length}`);
  }

  await browser.close();
  console.log(`✓ attached ${written} proof-of-delivery note(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
