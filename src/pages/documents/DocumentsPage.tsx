import { useState } from 'react';

import { PageHeader } from '@/components';

import { ComplianceDrive } from './components/ComplianceDrive';
import { FilesDrive } from './components/FilesDrive';
import type { DriveSection } from './components/DriveTabs';

/**
 * Fleetin Drive — everything the company keeps, in folders.
 *
 * Two halves, and they are different in kind rather than in content.
 *
 * **Compliance** is derived and closed. A folder exists because a transporter,
 * a truck or a driver does, and holds the four papers the catalogue asks that
 * owner for; every folder reports what is missing or lapsed anywhere beneath
 * it, so a red folder at the root leads to the one expired policy on truck
 * nineteen. Nothing can be added to that tree, because nothing can be added to
 * the fleet from a file browser.
 *
 * **Files** is made and open. Folders exist because somebody created them,
 * nested as deep as they like, holding whatever needed keeping — a signed
 * contract, a tender, a photograph of a damaged box. The catalogue has no
 * opinion on any of it: nothing here is required, expires, or is reviewed.
 *
 * The second half exists because the first one could not hold any of those
 * things, and people kept arriving wanting to file them. Both are browsed the
 * same way — same trail, same folder tiles, same search — so crossing between
 * the tabs does not mean learning a second file browser.
 *
 * The section lives in state rather than in the URL: it is which half of one
 * page you are reading, not a second page, and the drive has one route.
 */
export function DocumentsPage() {
  const [section, setSection] = useState<DriveSection>('compliance');

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHeader title="Fleetin Drive" />

      {section === 'compliance' ? (
        <ComplianceDrive onSection={setSection} />
      ) : (
        <FilesDrive onSection={setSection} />
      )}
    </div>
  );
}

export default DocumentsPage;
