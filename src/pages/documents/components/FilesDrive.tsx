import { DriveTabs, type DriveSection } from './DriveTabs';
import { FilesBrowser } from './FilesBrowser';

/**
 * The Files tab — the free tree that belongs to nobody in particular.
 *
 * Everything below the tab strip is `FilesBrowser`, unowned. The same browser
 * hangs inside every company's folder on the compliance drive, where a
 * contract with that haulier belongs; this is where the rest goes — the
 * papers that are not about one company, or not about a company at all.
 */
export function FilesDrive({ onSection }: { onSection: (next: DriveSection) => void }) {
  return (
    <div className="space-y-5">
      <DriveTabs value="files" onChange={onSection} />
      <FilesBrowser />
    </div>
  );
}
