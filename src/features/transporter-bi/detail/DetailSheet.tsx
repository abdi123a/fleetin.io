import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import type { TransporterDataset, TransporterFilters, DetailRequest } from '../contracts';

/**
 * Stub — replaced by the full detail sheet: trips lists, trip timelines,
 * driver / vehicle / route profiles and backhaul opportunity briefs, all
 * resolved from the same facts the charts used.
 */

export interface DetailSheetProps {
  request: DetailRequest | null;
  dataset: TransporterDataset;
  filters: TransporterFilters;
  onClose: () => void;
  /** Reserve action for backhaul opportunities, owned by the host. */
  reservedOpportunityIds?: ReadonlySet<string>;
  onReserveOpportunity?: (opportunityId: string) => void;
}

export function DetailSheet({ request, onClose }: DetailSheetProps) {
  return (
    <Sheet open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetTitle>Details</SheetTitle>
        <SheetDescription>Loading detail view…</SheetDescription>
      </SheetContent>
    </Sheet>
  );
}
