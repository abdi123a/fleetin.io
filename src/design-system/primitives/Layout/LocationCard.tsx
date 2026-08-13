import { forwardRef, type HTMLAttributes } from 'react';
import { MapPin, MoreVertical, Pencil, Trash2, Compass } from '@/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils';
import { IconChip } from '../Display/IconChip/IconChip';

export interface LocationCardProps extends HTMLAttributes<HTMLDivElement> {
  city: string;
  cityLabel?: string;
  address: string;
  addressLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewMap?: () => void;
}

export const LocationCard = forwardRef<HTMLDivElement, LocationCardProps>(
  function LocationCard(
    {
      city,
      cityLabel = 'City',
      address,
      addressLabel = 'Address Type 1',
      onEdit,
      onDelete,
      onViewMap,
      className,
      ...props
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          'group relative flex w-full flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-8 rounded-lg border border-border/80 bg-surface-sunken/40 dark:bg-card/40 p-5 sm:px-8 sm:py-6 min-h-[92px] transition duration-fast hover:border-border hover:shadow-xs hover:bg-surface-sunken/70',
          className,
        )}
        {...props}
      >
        {/* Left Side: Pin Icon + City Name & Sublabel */}
        <div className="flex items-center gap-4 min-w-[200px] shrink-0">
          <IconChip icon={MapPin} />
          <div className="flex flex-col justify-center">
            <span className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-snug">
              {city}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground/90 font-medium mt-0.5">
              {cityLabel}
            </span>
          </div>
        </div>

        {/* Middle Side: Address & Sublabel */}
        <div className="flex flex-col flex-1 justify-center sm:px-4">
          <span className="text-base sm:text-lg font-semibold text-foreground tracking-tight leading-snug">
            {address}
          </span>
          <span className="text-xs sm:text-sm text-muted-foreground/90 font-medium mt-1">
            {addressLabel}
          </span>
        </div>

        {/* Right Side: 3-Dots Menu Dropdown */}
        <div className="flex items-center justify-end shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Location actions"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onViewMap && (
                <DropdownMenuItem onClick={onViewMap} className="cursor-pointer gap-2">
                  <Compass className="h-4 w-4 text-muted-foreground" />
                  <span>View Map</span>
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit} className="cursor-pointer gap-2">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                  <span>Edit</span>
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  },
);
