import { Package, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { Badge, CloseButton, IconChip } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';

export interface PendingShipmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The account's own book — the containers listed here come from it. */
  rows: ShipperShipmentRow[];
}

/**
 * The containers still out, opened from the header's "N Pending Empty Return".
 *
 * It used to list eight invented shipments on Gulf lanes — Jebel Ali → Muscat,
 * Abu Dhabi → Dubai, priced in dollars — under a heading that promised this
 * account's pending work. Now it lists the boxes this shipper has genuinely not
 * returned yet, worst overrun first, which is the order somebody acting on the
 * list would want them in.
 */
export function PendingShipmentsModal({ isOpen, onClose, rows }: PendingShipmentsModalProps) {
  const navigate = useNavigate();

  const pending = rows
    .filter((row) => row.containerNo && !row.returnedAt)
    .sort((a, b) => b.emptyReturnOverdueDays - a.emptyReturnOverdueDays);

  if (!isOpen) return null;

  const handleViewAll = () => {
    onClose();
    navigate(`${ROUTES.shipmentsList}?status=Pending`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-lg border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-surface-sunken/40">
          <div className="flex items-center gap-3">
            <IconChip icon={Clock} tint="orange" />
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <span>Pending Shipments</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-warning-subtle text-warning-subtle-foreground border border-warning/25">
                  {pending.length} {pending.length === 1 ? 'Item' : 'Items'}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Containers delivered but not yet returned to the depot
              </p>
            </div>
          </div>

          <CloseButton onClick={onClose} />
        </div>

        {/* Modal Content / Table */}
        <div className="p-6 overflow-y-auto space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-sunken text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/60">
                <tr>
                  <th className="py-3 px-4">Container</th>
                  <th className="py-3 px-4">Shipment</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4 text-right">Past free time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-muted-foreground">
                      Every container is back at the depot.
                    </td>
                  </tr>
                )}
                {pending.map((row) => (
                  <tr key={row.shipmentId} className="hover:bg-surface-sunken/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-foreground flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-warning-subtle-foreground shrink-0" />
                      {row.containerNo}
                    </td>
                    <td className="py-3 px-4 font-mono text-foreground/90">{row.parentReference ?? row.reference}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {row.origin} → {row.destination}
                    </td>
                    <td className="py-3 px-4">
                      <Badge intent="warning" size="sm" className="font-semibold">
                        {row.stageLabel}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums">
                      {row.emptyReturnOverdueDays > 0 ? (
                        <span className="text-destructive">{row.emptyReturnOverdueDays}d</span>
                      ) : (
                        <span className="text-muted-foreground">within free time</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/60 bg-surface-sunken/40">
          <span className="text-xs text-muted-foreground">
            {pending.length} pending {pending.length === 1 ? 'container' : 'containers'}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-surface-sunken transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleViewAll}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-xs"
            >
              <span>Go to shipments</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PendingShipmentsModal;
