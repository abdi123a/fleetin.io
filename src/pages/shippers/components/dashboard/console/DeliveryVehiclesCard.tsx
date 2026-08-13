import { FleetSpotlightCard } from '@/features/shipper-bi/sections/cards/FleetSpotlightCard';
import type { SpotlightTransporter } from '@/features/shipper-bi/contracts';

export interface DeliveryVehiclesCardProps {
  preset?: string;
  from?: string;
  to?: string;
  transporters?: SpotlightTransporter[];
  className?: string;
}

export function DeliveryVehiclesCard({ transporters, className = '' }: DeliveryVehiclesCardProps) {
  return <FleetSpotlightCard transporters={transporters} className={className} />;
}

export default DeliveryVehiclesCard;

