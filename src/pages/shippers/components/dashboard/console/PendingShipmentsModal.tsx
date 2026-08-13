import { X, Package, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { Badge, IconChip } from '@/design-system';

export interface PendingShipmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOCK_PENDING_SHIPMENTS = [
  { id: 'SHP-8901', cargo: 'Container 40ft', origin: 'Jebel Ali', destination: 'Muscat', status: 'Pending Dispatch', date: 'Aug 5, 2026', price: '$4,200' },
  { id: 'SHP-8904', cargo: 'General Cargo', origin: 'Khalifa Port', destination: 'Sohar', status: 'Awaiting Driver', date: 'Aug 5, 2026', price: '$2,850' },
  { id: 'SHP-8907', cargo: 'Refrigerated', origin: 'Abu Dhabi', destination: 'Dubai', status: 'Doc Verification', date: 'Aug 4, 2026', price: '$1,950' },
  { id: 'SHP-8910', cargo: 'Flatbed Heavy', origin: 'Dammam', destination: 'Riyadh', status: 'Pending Approval', date: 'Aug 4, 2026', price: '$5,600' },
  { id: 'SHP-8912', cargo: 'Bulk Cement', origin: 'Salalah', destination: 'Muscat', status: 'Carrier Assignment', date: 'Aug 3, 2026', price: '$3,100' },
  { id: 'SHP-8915', cargo: 'Container 20ft', origin: 'Port Sultan', destination: 'Nizwa', status: 'Pending Dispatch', date: 'Aug 3, 2026', price: '$2,400' },
  { id: 'SHP-8918', cargo: 'Chemical Tanker', origin: 'Ruwais', destination: 'Jebel Ali', status: 'Awaiting Inspection', date: 'Aug 2, 2026', price: '$6,200' },
  { id: 'SHP-8922', cargo: 'Parcel Freight', origin: 'Sharjah', destination: 'Ras Al Khaimah', status: 'Pending Schedule', date: 'Aug 2, 2026', price: '$1,150' },
];

export function PendingShipmentsModal({ isOpen, onClose }: PendingShipmentsModalProps) {
  const navigate = useNavigate();

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
                  8 Items
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Shipments requiring dispatch, driver assignment, or documentation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content / Table */}
        <div className="p-6 overflow-y-auto space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-sunken text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border/60">
                <tr>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Cargo Type</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Estimated Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                {MOCK_PENDING_SHIPMENTS.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-surface-sunken/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-foreground flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-warning-subtle-foreground shrink-0" />
                      {shipment.id}
                    </td>
                    <td className="py-3 px-4 text-foreground/90">{shipment.cargo}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {shipment.origin} → {shipment.destination}
                    </td>
                    <td className="py-3 px-4">
                      <Badge intent="warning" size="sm" className="font-semibold">
                        {shipment.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                      {shipment.price}
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
            Showing all 8 pending items requiring your attention
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
              <span>Go to Shipments Page</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PendingShipmentsModal;
