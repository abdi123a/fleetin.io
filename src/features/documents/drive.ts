import type { DocumentRecord, DocumentOwnerType } from './api/documentsService';
import {
  complianceFindings,
  tallyFindings,
  type ComplianceFinding,
  type ComplianceOwner,
  type ComplianceTally,
  type DocumentState,
} from './compliance';

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

/**
 * One paper, as the folder draws it when it opens.
 *
 * Held papers only — a missing one is not a sheet in the folder, it is the
 * absence of one, and the badge under the tile is where that gets reported.
 * Most urgent first, so the three that surface are the three worth seeing.
 */
export interface FolderPaper {
  /** The catalogue's label: "Insurance", "Grey Card", "Driving Licence". */
  category: string;
  state: Exclude<DocumentState, 'missing'>;
  /** Whose paper it is — a company folder's sheets come from its trucks. */
  ownerLabel: string;
}

/** How many sheets a folder can show before the fan stops being readable. */
export const FOLDER_PAPERS = 3;

export interface DriveFolder {
  key: string;
  segment: DriveSegment;
  label: string;
  sublabel?: string;
  /** What to draw: a company gets its mark, the rest get a glyph. */
  icon: 'company' | 'folder' | 'vehicle' | 'driver';
  /** Set on a company folder, for `CompanyMark`. */
  company?: { id: string; name: string };
  /**
   * Which side of the book this folder belongs to, on a company folder.
   *
   * The two are mixed in one grid and owe completely different papers — a
   * transporter's dossier reaches down to its trucks and drivers, a shipper's
   * is one business licence — so the tile has to say which it is before it is
   * opened. Absent on everything below the company level, where the answer is
   * whatever the folder above already said.
   */
  party?: DriveCompany['kind'];
  tally: ComplianceTally;
  papers: FolderPaper[];
}

/** The owner whose papers this folder holds, when it is a leaf. */
export interface DriveLeaf {
  ownerType: Exclude<DocumentOwnerType, 'BOOKING' | 'FOLDER'>;
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

const URGENCY: Record<DocumentState, number> = { expired: 0, expiring: 1, valid: 2, missing: 3 };

/**
 * The three sheets a folder fans out, urgent first — and one per kind of paper.
 *
 * A transporter's folder holds eight trucks' grey cards, so ranking on urgency
 * alone fans out three sheets all reading "Grey Card": three copies of one fact
 * where three facts would fit. Taking one of each kind first answers the
 * question the picture is for — *what is in here* — and the count of how many
 * are lapsing is already on the badge underneath.
 */
function papersFrom(findings: ComplianceFinding[]): FolderPaper[] {
  const held = findings
    .filter((finding) => finding.state !== 'missing')
    .sort((a, b) => URGENCY[a.state] - URGENCY[b.state])
    .map((finding) => ({
      category: finding.category,
      state: finding.state as FolderPaper['state'],
      ownerLabel: finding.ownerLabel,
    }));

  const seen = new Set<string>();
  const papers = held.filter((paper) => {
    if (seen.has(paper.category)) return false;
    seen.add(paper.category);
    return true;
  });

  /* A folder that really does hold only one kind of paper still shows a stack
     — it just shows the same kind more than once, which is the truth. */
  for (const paper of held) {
    if (papers.length >= FOLDER_PAPERS) break;
    if (!papers.includes(paper)) papers.push(paper);
  }

  return papers.slice(0, FOLDER_PAPERS);
}

/**
 * Both halves of what a folder shows, off one pass of the compliance walk.
 *
 * The tally is the badge under the tile; the papers are what the folder fans
 * out when it opens. They come from the same findings because they are the same
 * question asked twice — counting it, and naming it.
 */
function summarise(
  owners: ComplianceOwner[],
  docs: DocumentRecord[],
  now: number,
): { tally: ComplianceTally; papers: FolderPaper[] } {
  const findings = complianceFindings(owners, docs, now);
  return { tally: tallyFindings(findings), papers: papersFrom(findings) };
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
      party: company.kind,
      ...summarise(ownersUnder(company), docs, now),
    }));
    return {
      trail,
      folders,
      leaf: null,
      tally: tallyFor(companies.flatMap(ownersUnder), docs, now),
    };
  }

  const company = companies.find((entry) => entry.id === first.id);
  if (!company) {
    return { trail, folders: [], leaf: null, tally: EMPTY_TALLY };
  }

  trail.push({ label: company.name, segment: first });
  const companyTally = tallyFor(ownersUnder(company), docs, now);

  /* ── Inside a company: the things that hold paper, and the one that does not
   *
   * A shipper has no fleet, so it gets two folders rather than four — but it
   * gets the same two shapes as a transporter. It used to open straight onto
   * its licence, which was one click shorter and left it the only company on
   * the drive with nowhere to keep a contract. ── */
  if (!second || second.kind !== 'section') {
    const selfOwner: ComplianceOwner[] = [
      { ownerType: company.kind, ownerId: company.id, ownerLabel: company.name },
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

    const fleet: DriveFolder[] =
      company.kind === 'SHIPPER'
        ? []
        : [
            {
              key: 'section:vehicles',
              segment: { kind: 'section', id: 'vehicles' },
              label: 'Vehicles',
              sublabel: countLabel(company.vehicles.length, 'truck'),
              icon: 'vehicle',
              ...summarise(vehicleOwners, docs, now),
            },
            {
              key: 'section:drivers',
              segment: { kind: 'section', id: 'drivers' },
              label: 'Drivers',
              sublabel: countLabel(company.drivers.length, 'driver'),
              icon: 'driver',
              ...summarise(driverOwners, docs, now),
            },
          ];

    return {
      trail,
      folders: [
        {
          key: 'section:company',
          segment: { kind: 'section', id: 'company' },
          label: 'Company',
          sublabel: 'Business licence',
          icon: 'folder',
          ...summarise(selfOwner, docs, now),
        },
        ...fleet,
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
        ownerType: company.kind,
        ownerId: company.id,
        label: company.name,
        reference: company.reference ?? company.name,
      },
      tally: tallyFor(
        [{ ownerType: company.kind, ownerId: company.id, ownerLabel: company.name }],
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
        ...summarise([{ ownerType, ownerId: record.id, ownerLabel: record.label }], docs, now),
      })),
      leaf: null,
      tally: sectionTally,
    };
  }

  const record = records.find((entry) => entry.id === third.id);
  if (!record) {
    return { trail, folders: [], leaf: null, tally: sectionTally };
  }

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
  /** Set on a company hit, so a search result wears the same mark the grid does. */
  party?: DriveCompany['kind'];
  path: DriveSegment[];
  tally: ComplianceTally;
  papers: FolderPaper[];
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
        /* A company is top-level, so it has no "where" — and the side of the
           book it is on now rides on the tile's own chip. This line used to
           carry "Transporter"/"Shipper"; saying it twice on one tile is worse
           than leaving the line blank. */
        where: '',
        icon: 'company',
        party: company.kind,
        path: [{ kind: 'company', id: company.id }],
        ...summarise(ownersUnder(company), docs, now),
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
        ...summarise(
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
        ...summarise(
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
  /* Empty for a shipper, not "Shipper": the tile's own chip says which side of
     the book this is, and this line is for what the folder REACHES — a
     transporter's trucks and drivers. A shipper is a leaf, so it reaches
     nothing, and repeating its type here says the same word twice on one
     tile. */
  if (company.kind === 'SHIPPER') return '';
  return `${countLabel(company.vehicles.length, 'truck')} · ${countLabel(company.drivers.length, 'driver')}`;
}
