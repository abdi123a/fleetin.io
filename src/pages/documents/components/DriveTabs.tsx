import type { ReactNode } from 'react';

import { ViewTabs } from '@/components';
import { Files, ShieldCheck } from '@/design-system/icons';

/**
 * The two halves of Fleetin Drive.
 *
 * **Compliance** is derived: a folder per company, per truck, per driver,
 * holding the four papers the catalogue asks for and reporting what is
 * missing or lapsed. **Files** is made: folders people create, holding
 * whatever they need kept — a contract, a tender, a photograph of a damaged
 * box — which the first half had no room for.
 *
 * A tab strip rather than a folder among the companies, because a folder
 * called "Files" sorted under "Needs attention" is a folder nobody finds.
 */
export type DriveSection = 'compliance' | 'files';

export interface DriveTabsProps {
  value: DriveSection;
  onChange: (next: DriveSection) => void;
  /** The section's own actions, at the far end of the band. */
  actions?: ReactNode;
}

const TABS = [
  { key: 'compliance' as const, label: 'Compliance', icon: ShieldCheck },
  { key: 'files' as const, label: 'Files', icon: Files },
];

export function DriveTabs({ value, onChange, actions }: DriveTabsProps) {
  return <ViewTabs label="Drive section" tabs={TABS} value={value} onChange={onChange} actions={actions} />;
}
