import React from 'react';
import type { MissionStatus } from '@/types/mission';
import { Badge } from '@/design-system';
import { displayShipmentStatus, statusBadgeIntentOf } from '@/lib/shipmentStatus';
import { CONTAINER_STATE_SENTENCE, type ContainerState } from '@/lib/containerState';
import {
  Clock,
  DollarSign,
  UserCheck,
  Truck,
  Navigation,
  MapPin,
  Package,
  ContainerIcon,
  ArrowRight,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from '@/design-system/icons';

interface MissionStatusBadgeProps {
  status: MissionStatus;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * What is in the box — full, empty, or back at the depot.
   *
   * It sets the container glyph and the chip's tooltip sentence, **not** the
   * colour. The colour is the ladder's phase, the same one the booking cards
   * under this shipment wear: teal booked, green in transit, amber owing a
   * return, slate closed. Left out (a bulk load, or a caller with no container
   * context) the chip keeps the rung's own icon.
   */
  containerState?: ContainerState | null;
}

export const MissionStatusBadge: React.FC<MissionStatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
  containerState,
}) => {
  const getStatusConfig = (
    status: MissionStatus,
  ): {
    intent: 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';
    icon: React.ElementType;
    label: string;
  } => {
    switch (status) {
      case 'Pending':
        return { intent: 'default', icon: Clock, label: 'Pending' };
      case 'Payment Pending':
        return { intent: 'warning', icon: DollarSign, label: 'Payment Pending' };
      case 'Assigned':
        return { intent: 'info', icon: UserCheck, label: 'Assigned' };
      case 'Driver Assigned':
        return { intent: 'info', icon: Truck, label: 'Driver Assigned' };
      case 'Heading to Pickup':
        return { intent: 'info', icon: Navigation, label: 'Heading to Pickup' };
      case 'At Pickup':
        return { intent: 'info', icon: MapPin, label: 'At Pickup' };
      case 'Loaded':
        return { intent: 'primary', icon: Package, label: 'Loaded' };
      case 'En Route':
        return { intent: 'primary', icon: Navigation, label: 'En Route' };
      case 'Arrived':
        return { intent: 'primary', icon: MapPin, label: 'Arrived' };
      case 'Loading':
        return { intent: 'info', icon: Package, label: 'Loading' };
      case 'Unloading':
        return { intent: 'info', icon: ArrowRight, label: 'Unloading' };
      case 'POD Submitted':
        return { intent: 'info', icon: FileCheck, label: 'POD Submitted' };
      case 'Empty Ready':
        return { intent: 'info', icon: Package, label: 'Empty Ready' };
      case 'Completed':
        return { intent: 'success', icon: CheckCircle2, label: 'Completed' };
      case 'Cancelled':
        return { intent: 'default', icon: XCircle, label: 'Cancelled' };
      case 'Failed':
        return { intent: 'destructive', icon: AlertTriangle, label: 'Failed' };
      default:
        return { intent: 'default', icon: Clock, label: status };
    }
  };

  const config = getStatusConfig(status);
  /* A container, not a parcel — this chip is about a shipping box. The
     full/empty/returned distinction is carried by colour and by the word;
     `ContainerStateTag` keeps the three distinct box icons where the two states
     sit side by side and must never be mistaken for each other. */
  const Icon = containerState ? ContainerIcon : config.icon;
  /* The phase, not the box. A shipment in transit used to print the teal of a
     loaded container while every booking under it printed the green of work in
     progress — the same job in two colours, and "Created" and "Picked Up" then
     read identically at shipment level. The booking cards were moved onto the
     phase on 2026-08-30; this is the shipment-level half of that change.
     What is *inside* the box is still carried here, by the container glyph and
     the tooltip sentence, which is where it does not collide with the phase. */
  const intent = containerState ? statusBadgeIntentOf(status) : config.intent;
  // The icon and colour still track the precise rung of the ladder; only the
  // word is the shared plain-language one, so this badge and the booking
  // cards under a shipment can never disagree about what to call the same
  // status. See `@/lib/shipmentStatus`.
  const label = displayShipmentStatus(config.label, 'shipment');

  return (
    <Badge
      intent={intent}
      size={size}
      title={containerState ? CONTAINER_STATE_SENTENCE[containerState] : undefined}
      className={`inline-flex items-center gap-1.5 font-semibold ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </Badge>
  );
};
