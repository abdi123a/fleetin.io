/**
 * One logo per customer — the shipper on the other end of every move.
 *
 * The transporter's customers *are* shippers: `SHP-101` in this dataset and
 * `SHP-101` on the shipper dashboard are the same company, so they carry the
 * same identity mark. Ids 101–104 therefore mirror the logos held in
 * `@/data/shippersData`, the record those four accounts actually live in;
 * 105–108 exist only on this corridor and carry their own.
 *
 * Same join seam as `transporterProfiles` on the shipper side: logos are not on
 * the BI customer dimension yet, and this is where they attach until they are.
 * Rows that only carry a name resolve through `CUSTOMER_ID_BY_NAME`, so a table
 * cell and a dashboard panel can never show a company two different ways.
 */

export const CUSTOMER_LOGOS: Record<string, string> = {
  // Shared with the shipper accounts — keep these in step with shippersData.
  'SHP-101':
    'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&auto=format&fit=crop&q=80',
  'SHP-102':
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=120&auto=format&fit=crop&q=80',
  'SHP-103':
    'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=120&auto=format&fit=crop&q=80',
  'SHP-104':
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=120&auto=format&fit=crop&q=80',
  // Corridor-only accounts.
  'SHP-105':
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&auto=format&fit=crop&q=80',
  'SHP-106':
    'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=120&auto=format&fit=crop&q=80',
  'SHP-107':
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=120&auto=format&fit=crop&q=80',
  'SHP-108':
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=120&auto=format&fit=crop&q=80',
};

/** Stable name → id map for rows that only carry the company name. */
const CUSTOMER_ID_BY_NAME: Record<string, string> = {
  'AMINA FZCO': 'SHP-101',
  'Al-Baraka Logistics Ltd': 'SHP-102',
  'Red Sea Cargo Group': 'SHP-103',
  'East Africa Beverages': 'SHP-104',
  'Horn Agro Exports': 'SHP-105',
  'Sheba Textiles': 'SHP-106',
  'Nile Valley Foods': 'SHP-107',
  'Djibouti Cement Co.': 'SHP-108',
  // Backhaul counterparties — posted loads rather than contracted accounts, so
  // each borrows the mark of the account it trades the same cargo as.
  'Ethio Coffee Exporters': 'SHP-105',
  'Awash Agro Industries': 'SHP-105',
  'Hawassa Textile Mills': 'SHP-106',
  'Mekelle Trading House': 'SHP-102',
  'Adama Oilseed Union': 'SHP-107',
  'Dire Dawa Freight Co.': 'SHP-102',
  'Addis Commodity Exchange': 'SHP-103',
};

export function getCustomerLogoUrl(
  idOrName: string | undefined | null,
): string | undefined {
  if (!idOrName) return undefined;
  return CUSTOMER_LOGOS[idOrName] ?? CUSTOMER_LOGOS[CUSTOMER_ID_BY_NAME[idOrName] ?? ''];
}

/** Two-letter stand-in for a company whose logo has not loaded. */
export function customerInitials(name: string | undefined | null): string {
  const [first, second] = (name ?? '').split(/\s+/).filter(Boolean);
  if (!first) return '—';
  if (!second) return first.substring(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}
