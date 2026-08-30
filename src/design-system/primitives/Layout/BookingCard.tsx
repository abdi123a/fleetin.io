import type { StatusIntent } from './statusIntent';
import { forwardRef, type HTMLAttributes } from 'react';
import { MoreVertical } from '@/design-system/icons';

import { Card } from './Card';
import { CardDataField } from './CardDataField';
import { CornerBadge } from './CornerBadge';
import { UserAvatar, VehicleAvatar } from '../Display/Identity/Identity';
import { VerificationBadge } from '../Display/Status/StatusBadge';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu/DropdownMenu';
import { ShipmentCard, type ShipmentCardProps } from './ShipmentCard';
import { cn } from '@/utils';

export interface DriverBookingCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'driver';
  bookingNumber: string;
  driverName: string;
  driverVerified?: boolean;
  vehicleNumber: string;
  vehicleVerified?: boolean;
  status?: string;
  statusIntent?: StatusIntent;
  clickable?: boolean;
}

export type BookingCardProps =
  | ({ variant?: 'full' } & ShipmentCardProps)
  | DriverBookingCardProps;

export const BookingCard = forwardRef<HTMLDivElement, BookingCardProps>(
  function BookingCard(props, ref) {
    if (props.variant === 'driver') {
      const {
        bookingNumber,
        driverName,
        driverVerified = true,
        vehicleNumber,
        vehicleVerified = true,
        status = 'Trip completed',
        statusIntent = 'green',
        clickable = false,
        className,
        onClick,
        variant: _variant,
        ...rest
      } = props;

      const statusBgClasses: Record<StatusIntent, string> = {
        teal: 'bg-primary text-primary-foreground',
        green: 'bg-success text-white dark:bg-success',
        orange: 'bg-warning text-white dark:bg-warning',
        blue: 'bg-info text-white dark:bg-info',
        slate: 'bg-secondary text-secondary-foreground',
      };

      return (
        <Card
          ref={ref}
          onClick={onClick}
          className={cn(
            'relative overflow-hidden rounded-lg border border-border/80 bg-surface text-foreground shadow-2xs hover:shadow-md transition duration-200 p-5 pt-14 sm:pt-14',
            clickable && 'cursor-pointer hover:border-primary/40',
            className,
          )}
          {...rest}
        >
          {/* Top-Left Corner Badge (Signature FLEETIN Tab Shape) */}
          <div className="absolute top-0 left-0 z-10 select-none">
            <CornerBadge label={`Booking No. ${bookingNumber}`} intent="teal" position="top" />
          </div>

          {/* Top-Right Status Pill */}
          {status && (
            <div className="absolute top-3.5 right-4 sm:right-5 z-10 select-none">
              <Badge
                variant="solid"
                className={cn('text-xs font-bold px-3.5 py-1 rounded-full shadow-2xs uppercase tracking-wide', statusBgClasses[statusIntent])}
              >
                {status}
              </Badge>
            </div>
          )}

          {/* Data Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 items-center pr-8 sm:pr-12">
            <CardDataField
              icon={<UserAvatar name={driverName} size="xs" />}
              iconTheme="none"
              value={driverName}
              label="Driver"
              action={<VerificationBadge state={driverVerified ? 'verified' : 'unverified'} size="sm" />}
            />

            <CardDataField
              icon={<VehicleAvatar size="xs" />}
              iconTheme="none"
              value={vehicleNumber}
              label="Vehicle No."
              action={<VerificationBadge state={vehicleVerified ? 'verified' : 'unverified'} size="sm" />}
            />
          </div>

          {/* More options button */}
          <div className="absolute bottom-3 right-3.5 sm:right-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors p-1.5"
                  aria-label="More options"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem>View booking</DropdownMenuItem>
                <DropdownMenuItem>Driver details</DropdownMenuItem>
                <DropdownMenuItem>Track trip</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      );
    }

    // Default 'full' variant uses ShipmentCard underlying grid layout with booking number
    const { bookingNumber = '1172', ...fullProps } = props as ShipmentCardProps;
    return <ShipmentCard ref={ref} bookingNumber={bookingNumber} {...fullProps} />;
  },
);

