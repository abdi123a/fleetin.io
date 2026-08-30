/**
 * One logo per transporter — shared across the shipper dashboard
 * so every place a carrier is named shows the same identity mark.
 *
 * Partner logos are not on the BI transporter dimension yet; this is the join
 * seam until those fields land on the entity.
 */

export interface TransporterProfile {
  logoUrl: string;
}

export const TRANSPORTER_PROFILES: Record<string, TransporterProfile> = {
  'TRP-01': {
    logoUrl:
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-02': {
    logoUrl:
      'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-03': {
    logoUrl:
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-04': {
    logoUrl:
      'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-05': {
    logoUrl:
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-06': {
    logoUrl:
      'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=120&auto=format&fit=crop&q=80',
  },
  'TRP-07': {
    logoUrl:
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=120&auto=format&fit=crop&q=80',
  },
};

/** Stable name → id map for rows that only carry the company name. */
const TRANSPORTER_ID_BY_NAME: Record<string, string> = {
  'Horn Logistics': 'TRP-01',
  'Bab El Mandeb Transit': 'TRP-02',
  'Awash Freight Lines': 'TRP-03',
  'Tadjoura Haulage': 'TRP-04',
  'Red Sea Movers': 'TRP-05',
  'Red Sea Logistics': 'TRP-05',
  'Djibouti Express': 'TRP-06',
  'Gulf Freight Partners': 'TRP-07',
  'Gulf Express Transporters': 'TRP-07',
};

export function getTransporterProfile(
  idOrName: string | undefined | null,
): TransporterProfile | undefined {
  if (!idOrName) return undefined;
  return (
    TRANSPORTER_PROFILES[idOrName] ??
    TRANSPORTER_PROFILES[TRANSPORTER_ID_BY_NAME[idOrName] ?? '']
  );
}

export function getTransporterLogoUrl(
  idOrName: string | undefined | null,
): string | undefined {
  return getTransporterProfile(idOrName)?.logoUrl;
}
