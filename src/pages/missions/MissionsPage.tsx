import { useShipmentStore } from '@/stores/shipment.store';
import { ShipmentsListView } from './components/ShipmentsListView';

/** Every shipment, company-wide — row-scoped server-side for portal callers, unscoped for Admin/Ops. */
export function MissionsPage() {
  const missions = useShipmentStore((s) => s.missions);

  return <ShipmentsListView missions={missions} />;
}
