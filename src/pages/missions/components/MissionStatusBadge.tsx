import React from 'react';
import type { MissionStatus } from '@/types/mission';
import { Badge } from '@/design-system';
import { displayShipmentStatus } from '@/lib/shipmentStatus';
import {
  CONTAINER_STATE_BADGE_CLASS,
  CONTAINER_STATE_BADGE_INTENT,
  CONTAINER_STATE_SENTENCE,
  type ContainerState,
} from '@/lib/containerState';
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
   * What is in the box — teal while full, brand yellow once empty.
   *
   * When the caller knows a shipment carries containers it passes this, and the
   * badge takes the app-wide container pair instead of the ladder's own hues:
   * the same shipment then reads identically on the list, in the grid and on
   * its own page. Left out (a bulk load, or a caller with no container context)
   * the badge keeps the per-rung colours it always had.
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
  const intent = containerState ? CONTAINER_STATE_BADGE_INTENT[containerState] : config.intent;
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
      className={`inline-flex items-center gap-1.5 font-semibold ${containerState ? CONTAINER_STATE_BADGE_CLASS[containerState] : ''} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </Badge>
  );
};
