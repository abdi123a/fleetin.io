import { Download, Plus } from 'lucide-react';

import { EmptyReturnClock } from '../atoms';

/**
 * The console's opening line — deliberately not the shipper/transporter
 * greeting. This module runs on a clock racing a deadline, not a "welcome
 * back" narrative, so the header just says what the page is and gets out of
 * the way: a title, a one-line brief, the live clock every figure below is
 * read against, an export action, and the module's one creation action.
 *
 * `onCreateMatch` was the Matching page's own header action until the two
 * pages were consolidated — Matching is a workbench you land on with a
 * container already in mind, not where you'd start "make me a match", so
 * the action moved to the console's landing header instead.
 *
 * No alert pills here either. The five KPI tiles directly beneath already
 * carry Overdue and Critical in solid colour — repeating those counts as
 * pills above them said the same number twice before the reader had scrolled
 * an inch.
 */

export interface EmptyReturnConsoleHeaderProps {
  onExportCsv?: () => void;
  onCreateMatch?: () => void;
}

export function EmptyReturnConsoleHeader({ onExportCsv, onCreateMatch }: EmptyReturnConsoleHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Empty Returns
        </h1>
        <p className="type-body-sm mt-1 text-muted-foreground">
          Every empty tracked to its return deadline, matched to a full load before the cutoff.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="rounded-full border border-border bg-surface px-4 py-2 shadow-xs">
          <EmptyReturnClock />
        </div>

        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-surface-sunken"
        >
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Export CSV</span>
        </button>

        <button
          type="button"
          onClick={onCreateMatch}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Match</span>
        </button>
      </div>
    </div>
  );
}

export default EmptyReturnConsoleHeader;
