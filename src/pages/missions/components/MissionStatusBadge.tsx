import React from 'react';
import type { MissionStatus } from '@/types/mission';
import { Badge } from '@/design-system';
import { displayShipmentStatus } from '@/lib/shipmentStatus';
import {
  Clock,
  DollarSign,
  UserCheck,
  Truck,
  Navigation,
  MapPin,
  Package,
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
}

export const MissionStatusBadge: React.FC<MissionStatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
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
  const Icon = config.icon;
  // The icon and colour still track the precise rung of the ladder; only the
  // word is the shared plain-language one, so this badge and the booking
  // cards under a shipment can never disagree about what to call the same
  // status. See `@/lib/shipmentStatus`.
  const label = displayShipmentStatus(config.label, 'shipment');

  return (
    <Badge
      intent={config.intent}
      size={size}
      className={`inline-flex items-center gap-1.5 font-semibold ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </Badge>
  );
};
