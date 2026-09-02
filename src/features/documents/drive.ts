import type { DocumentRecord, DocumentOwnerType } from './api/documentsService';
import { complianceFindings, tallyFindings, type ComplianceOwner, type ComplianceTally } from './compliance';

/**
 * The document book as a set of folders.
 *
 * A flat register answers "what lapses this month" and nothing else. The
 * question people actually arrive with is the other one — *"show me everything
 * we hold on Massida Logistics"* — and a flat list answers that only by being
 * filtered, which means knowing what to type before you can look.
 *
 * So the book is a tree, shaped the way the papers are actually owned:
 *
 * ```
 * Massida Logistics            ← the company
 * ├── Company                  → its business licence
 * ├── Vehicles
 * │   └── MS-1221-DJ           → grey card · insurance
 * └── Drivers
 *     └── Ahmed Robleh         → driving licence
 * ```
 *
 * A shipper has no fleet, so it is a leaf: one folder, one licence, no
 * sub-folders invented for symmetry's sake.
 *
 * ## Every folder carries what is wrong inside it
 *
 * The tree would otherwise cost you the one thing the flat list was good at:
 * you would have to open ten companies to find the one lapsed policy. Each
 * folder is tallied over everything beneath it, so a fault is visible from the
 * root and stays visible at every level on the way down to it.
 */

export interface DriveVehicle {
  id: string;
  /** The plate — what people say out loud. */
  label: string;
  /** The make and type, for the second line. */
  sublabel?: string;
  /** `VEH-#####` — what a raised task links to. */
  reference?: string;
}

export interface DriveDriver {
  id: string;
  label: string;
  sublabel?: string;
  reference?: string;
}

export interface DriveCompany {
  id: string;
  name: string;
  /** A transporter has a fleet; a shipper is a leaf. */
  kind: 'PARTNER' | 'SHIPPER';
  reference?: string;
  vehicles: DriveVehicle[];
  drivers: DriveDriver[];
}

/** One step down the tree. The path is an array of these. */
export type DriveSegment =
  | { kind: 'company'; id: string }
  | { kind: 'section'; id: 'company' | 'vehicles' | 'drivers' }
  | { kind: 'record'; ownerType: 'VEHICLE' | 'DRIVER'; id: string };

export type DrivePath = readonly DriveSegment[];

export interface DriveFolder {
  key: string;
  segment: DriveSegment;
  label: string;
  sublabel?: string;
  /** What to draw: a company gets its mark, the rest get a glyph. */
  icon: 'company' | 'folder' | 'vehicle' | 'driver';
  /** Set on a company folder, for `CompanyMark`. */
  company?: { id: string; name: string };
  tally: ComplianceTally;
}

/** The owner whose papers this folder holds, when it is a leaf. */
export interface DriveLeaf {
  ownerType: Exclude<DocumentOwnerType, 'BOOKING'>;
  ownerId: string;
  label: string;
  /** The human reference a raised task links to; the label when there is none. */
  reference: string;
}

export interface DriveListing {
  /** One entry per level, root first. `segment` is null for the root. */
  trail: { label: string; segment: DriveSegment | null }[];
  folders: DriveFolder[];
  /** Present instead of folders when this level holds documents. */
  leaf: DriveLeaf | null;
  /** Everything under this folder, for the figures above the listing. */
  tally: ComplianceTally;
}

/** Every owner beneath a company — itself, its trucks, its drivers. */
function ownersUnder(company: DriveCompany): ComplianceOwner[] {
  const owners: ComplianceOwner[] = [
    { ownerType: company.kind, ownerId: company.id, ownerLabel: company.name },
  ];
  for (const vehicle of company.vehicles) {
    owners.push({ ownerType: 'VEHICLE', ownerId: vehicle.id, ownerLabel: vehicle.label });
  }
  for (const driver of company.drivers) {
    owners.push({ ownerType: 'DRIVER', ownerId: driver.id, ownerLabel: driver.label });
  }
  return owners;
}

function tallyFor(owners: ComplianceOwner[], docs: DocumentRecord[], now: number): ComplianceTally {
  return tallyFindings(complianceFindings(owners, docs, now));
}

/**
 * What to show at `path`.
 *
 * Pure, and given the whole book at once: the tree is walked by a reader
 * clicking, and re-fetching a level per click would make a folder that opens in
 * 300ms out of data that was already in memory.
 */
export function listDrive(
  path: DrivePath,
  companies: DriveCompany[],
  docs: DocumentRecord[],
  now = Date.now(),
): DriveListing {
  const trail: DriveListing['trail'] = [{ label: 'Fleetin Drive', segment: null }];

  /* ── Root: every company we hold anything for ── */
  const [first, second, third] = path;
  if (!first || first.kind !== 'company') {
    const folders = companies.map<DriveFolder>((company) => ({
      key: `company:${company.id}`,
      segment: { kind: 'company', id: company.id },
      label: company.name,
      sublabel: describeFleet(company),
      icon: 'company',
      company: { id: company.id, name: company.name },
      tally: tallyFor(ownersUnder(company), docs, now),
    }));
    return {
      trail,
      folders,
      leaf: null,
      tally: tallyFor(companies.flatMap(ownersUnder), docs, now),
    };
  }

  const company = companies.find((entry) => entry.id === first.id);
  if (!company) return { trail, folders: [], leaf: null, tally: EMPTY_TALLY };

  trail.push({ label: company.name, segment: first });
  const companyTally = tallyFor(ownersUnder(company), docs, now);

  /* ── A shipper is its own leaf: one licence, and no fleet to file under ── */
  if (company.kind === 'SHIPPER') {
    return {
      trail,
      folders: [],
      leaf: {
        ownerType: 'SHIPPER',
        ownerId: company.id,
        label: company.name,
        reference: company.reference ?? company.name,
      },
      tally: companyTally,
    };
  }

  /* ── Inside a transporter: the three things that hold paper ── */
  if (!second || second.kind !== 'section') {
    const selfOwner: ComplianceOwner[] = [
      { ownerType: 'PARTNER', ownerId: company.id, ownerLabel: company.name },
    ];
    const vehicleOwners = company.vehicles.map<ComplianceOwner>((vehicle) => ({
      ownerType: 'VEHICLE',
      ownerId: vehicle.id,
      ownerLabel: vehicle.label,
    }));
    const driverOwners = company.drivers.map<ComplianceOwner>((driver) => ({
      ownerType: 'DRIVER',
      ownerId: driver.id,
      ownerLabel: driver.label,
    }));

    return {
      trail,
      folders: [
        {
          key: 'section:company',
          segment: { kind: 'section', id: 'company' },
          label: 'Company',
          sublabel: 'Business licence',
          icon: 'folder',
          tally: tallyFor(selfOwner, docs, now),
        },
        {
          key: 'section:vehicles',
          segment: { kind: 'section', id: 'vehicles' },
          label: 'Vehicles',
          sublabel: countLabel(company.vehicles.length, 'truck'),
          icon: 'vehicle',
          tally: tallyFor(vehicleOwners, docs, now),
        },
        {
          key: 'section:drivers',
          segment: { kind: 'section', id: 'drivers' },
          label: 'Drivers',
          sublabel: countLabel(company.drivers.length, 'driver'),
          icon: 'driver',
          tally: tallyFor(driverOwners, docs, now),
        },
      ],
      leaf: null,
      tally: companyTally,
    };
  }

  /* ── The company's own paper ── */
  if (second.id === 'company') {
    trail.push({ label: 'Company', segment: second });
    return {
      trail,
      folders: [],
      leaf: {
        ownerType: 'PARTNER',
        ownerId: company.id,
        label: company.name,
        reference: company.reference ?? company.name,
      },
      tally: tallyFor(
        [{ ownerType: 'PARTNER', ownerId: company.id, ownerLabel: company.name }],
        docs,
        now,
      ),
    };
  }

  /* ── The fleet, or the crew ── */
  const isVehicles = second.id === 'vehicles';
  const records = isVehicles ? company.vehicles : company.drivers;
  const ownerType: 'VEHICLE' | 'DRIVER' = isVehicles ? 'VEHICLE' : 'DRIVER';
  trail.push({ label: isVehicles ? 'Vehicles' : 'Drivers', segment: second });

  const sectionOwners = records.map<ComplianceOwner>((record) => ({
    ownerType,
    ownerId: record.id,
    ownerLabel: record.label,
  }));
  const sectionTally = tallyFor(sectionOwners, docs, now);

  if (!third || third.kind !== 'record') {
    return {
      trail,
      folders: records.map<DriveFolder>((record) => ({
        key: `${ownerType}:${record.id}`,
        segment: { kind: 'record', ownerType, id: record.id },
        label: record.label,
        sublabel: record.sublabel,
        icon: isVehicles ? 'vehicle' : 'driver',
        tally: tallyFor(
          [{ ownerType, ownerId: record.id, ownerLabel: record.label }],
          docs,
          now,
        ),
      })),
      leaf: null,
      tally: sectionTally,
    };
  }

  const record = records.find((entry) => entry.id === third.id);
  if (!record) return { trail, folders: [], leaf: null, tally: sectionTally };

  trail.push({ label: record.label, segment: third });
  return {
    trail,
    folders: [],
    leaf: {
      ownerType,
      ownerId: record.id,
      label: record.label,
      reference: record.reference ?? record.label,
    },
    tally: tallyFor([{ ownerType, ownerId: record.id, ownerLabel: record.label }], docs, now),
  };
}

/**
 * Every leaf in the tree whose name matches, with the way back to it.
 *
 * What a search box in a file browser is for. Filtering the folder you happen
 * to be standing in means finding a truck requires knowing which haulier owns
 * it — which is the thing you were searching to find out.
 */
export interface DriveMatch {
  key: string;
  label: string;
  /** "Massida Logistics · Vehicles" — where it lives. */
  where: string;
  icon: DriveFolder['icon'];
  path: DriveSegment[];
  tally: ComplianceTally;
}

export function searchDrive(
  term: string,
  companies: DriveCompany[],
  docs: DocumentRecord[],
  now = Date.now(),
): DriveMatch[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const matches: DriveMatch[] = [];
  const hit = (value: string | undefined) => Boolean(value?.toLowerCase().includes(needle));

  for (const company of companies) {
    if (hit(company.name)) {
      matches.push({
        key: `company:${company.id}`,
        label: company.name,
        where: company.kind === 'PARTNER' ? 'Transporter' : 'Shipper',
        icon: 'company',
        path: [{ kind: 'company', id: company.id }],
        tally: tallyFor(ownersUnder(company), docs, now),
      });
    }

    for (const vehicle of company.vehicles) {
      if (!hit(vehicle.label) && !hit(vehicle.sublabel)) continue;
      matches.push({
        key: `VEHICLE:${vehicle.id}`,
        label: vehicle.label,
        where: `${company.name} · Vehicles`,
        icon: 'vehicle',
        path: [
          { kind: 'company', id: company.id },
          { kind: 'section', id: 'vehicles' },
          { kind: 'record', ownerType: 'VEHICLE', id: vehicle.id },
        ],
        tally: tallyFor(
          [{ ownerType: 'VEHICLE', ownerId: vehicle.id, ownerLabel: vehicle.label }],
          docs,
          now,
        ),
      });
    }

    for (const driver of company.drivers) {
      if (!hit(driver.label) && !hit(driver.sublabel)) continue;
      matches.push({
        key: `DRIVER:${driver.id}`,
        label: driver.label,
        where: `${company.name} · Drivers`,
        icon: 'driver',
        path: [
          { kind: 'company', id: company.id },
          { kind: 'section', id: 'drivers' },
          { kind: 'record', ownerType: 'DRIVER', id: driver.id },
        ],
        tally: tallyFor(
          [{ ownerType: 'DRIVER', ownerId: driver.id, ownerLabel: driver.label }],
          docs,
          now,
        ),
      });
    }
  }

  return matches;
}

const EMPTY_TALLY: ComplianceTally = {
  required: 0,
  valid: 0,
  expiring: 0,
  expired: 0,
  missing: 0,
  attention: 0,
};

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describeFleet(company: DriveCompany): string {
  if (company.kind === 'SHIPPER') return 'Shipper';
  return `${countLabel(company.vehicles.length, 'truck')} · ${countLabel(company.drivers.length, 'driver')}`;
}
