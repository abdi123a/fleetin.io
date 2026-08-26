import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Loader2,
  Minus,
  RefreshCw,
  Wifi,
  WifiOff,
  XCircle,
} from '@/design-system/icons';

import { type ReactNode } from 'react';

import { Badge, type BadgeProps } from '@/design-system/primitives/Badge';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * StatusBadge
 * ---------------------------------------------------------------------------
 * Maps domain status strings to Badge intents automatically so every module
 * uses a consistent colour vocabulary without repeating the mapping.
 * ------------------------------------------------------------------------- */

export type DomainStatus =
  | 'active' | 'inactive' | 'enabled' | 'disabled'
  | 'pending' | 'in_progress' | 'processing'
  | 'completed' | 'delivered' | 'approved' | 'verified' | 'fulfilled'
  | 'dispatched' | 'dispatch_started' | 'transit' | 'in_transit'
  | 'cancelled' | 'rejected' | 'suspended' | 'blocked' | 'failed' | 'expired'
  | 'draft' | 'archived' | 'unknown';

const STATUS_INTENT: Record<DomainStatus, BadgeProps['intent']> = {
  active: 'success', enabled: 'success', completed: 'success',
  delivered: 'success', approved: 'success', verified: 'success',
  fulfilled: 'success', dispatched: 'success',
  in_progress: 'primary', processing: 'primary', transit: 'primary',
  dispatch_started: 'accent', in_transit: 'primary',
  pending: 'warning',
  cancelled: 'destructive', rejected: 'destructive', suspended: 'destructive',
  blocked: 'destructive', failed: 'destructive', expired: 'destructive',
  inactive: 'default', disabled: 'default', draft: 'default',
  archived: 'default', unknown: 'default',
};

const STATUS_LABEL: Partial<Record<DomainStatus, string>> = {
  in_progress: 'In Progress', dispatch_started: 'Dispatch Started',
  in_transit: 'In Transit',
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'intent'> {
  /** Domain status string — mapped to intent automatically. */
  status: DomainStatus;
  /** Override the display label (defaults to title-cased status). */
  label?: string;
}

function toLabel(s: string) {
  return STATUS_LABEL[s as DomainStatus] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, label, variant = 'subtle', size, className, ...props }: StatusBadgeProps) {
  return (
    <Badge
      intent={STATUS_INTENT[status] ?? 'default'}
      variant={variant}
      size={size}
      className={className}
      {...props}
    >
      {label ?? toLabel(status)}
    </Badge>
  );
}

/* ---------------------------------------------------------------------------
 * VerificationBadge
 * ---------------------------------------------------------------------------
 * The one verified mark in the product — a bare tick beside the name it
 * confirms, exactly like a social-media checkmark: no pill, no border, no
 * label. It renders only for the verified state; every other state is
 * silence, because that is how the pattern it's copying works too — a
 * platform doesn't badge an account "unverified," it just doesn't badge it.
 *
 * Before this, every real call site had to override the badge back down to a
 * bare tick by hand (`bg-transparent border-0 px-0 ...`), inconsistently, and
 * three unrelated pages (Drivers, Vehicles, the Partner workspace) had
 * separately reinvented the same tick with a raw `BadgeCheck` icon instead of
 * this component — one of them shown unconditionally, regardless of whether
 * the record actually had valid documents.
 * ------------------------------------------------------------------------- */

export type VerificationState = 'verified' | 'unverified' | 'pending' | 'rejected';

export interface VerificationBadgeProps {
  state: VerificationState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const VERIFICATION_ICON_SIZE: Record<NonNullable<VerificationBadgeProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function VerificationBadge({ state, size = 'md', className }: VerificationBadgeProps) {
  if (state !== 'verified') return null;
  /*
   * Filled, in the brand teal, with the tick knocked out of it.
   *
   * Lucide's `BadgeCheck` is two paths — the scalloped rosette and the tick —
   * and a blanket `fill="currentColor"` floods both, turning it into a blob.
   * So the rosette takes the fill and the tick is re-stroked in the badge's
   * foreground, which is what makes it read at 14px.
   *
   * `--primary-bold` (teal-700), not `--primary`: this is a filled surface
   * carrying a mark, and the ramp's own note is that teal-700 is the step that
   * carries white at 5.6:1.
   */
  return (
    <BadgeCheck
      aria-label="Verified"
      className={cn(
        VERIFICATION_ICON_SIZE[size],
        'shrink-0 text-primary-bold',
        '[&>path:first-child]:fill-current [&>path:first-child]:stroke-current',
        '[&>path:last-child]:stroke-primary-bold-foreground',
        className,
      )}
    />
  );
}

/* ---------------------------------------------------------------------------
 * ExpiryBadge
 * ---------------------------------------------------------------------------
 * Displays days until document / licence expiry.
 * Auto-intent: >30 days = success, 1–30 = warning, 0 or past = destructive.
 * ------------------------------------------------------------------------- */

export interface ExpiryBadgeProps extends Omit<BadgeProps, 'intent'> {
  /** Expiry date. */
  expiresAt: Date | string;
  /** Show "Expires in N days" instead of just "N days". */
  verbose?: boolean;
}

function daysUntil(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function ExpiryBadge({ expiresAt, verbose = false, variant = 'subtle', size, className, ...props }: ExpiryBadgeProps) {
  const days = daysUntil(expiresAt);
  const intent: BadgeProps['intent'] = days > 30 ? 'success' : days > 0 ? 'warning' : 'destructive';
  const label = days <= 0
    ? 'Expired'
    : verbose
      ? `Expires in ${days}d`
      : `${days}d`;

  return (
    <Badge intent={intent} variant={variant} size={size} className={cn('tabular-nums', className)} {...props}>
      <Clock className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/* ---------------------------------------------------------------------------
 * PriorityBadge
 * ------------------------------------------------------------------------- */

export type Priority = 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_CONFIG: Record<Priority, { intent: BadgeProps['intent']; icon: ReactNode }> = {
  critical: { intent: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  high:     { intent: 'warning',     icon: <AlertTriangle className="h-3 w-3" /> },
  medium:   { intent: 'accent',      icon: <Minus         className="h-3 w-3" /> },
  low:      { intent: 'default',     icon: <Minus         className="h-3 w-3" /> },
};

export interface PriorityBadgeProps extends Omit<BadgeProps, 'intent'> {
  priority: Priority;
}

export function PriorityBadge({ priority, variant = 'subtle', size, className, ...props }: PriorityBadgeProps) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <Badge intent={cfg.intent} variant={variant} size={size} className={className} {...props}>
      {cfg.icon}
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

/* ---------------------------------------------------------------------------
 * HealthBadge
 * ------------------------------------------------------------------------- */

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'maintenance';

const HEALTH_CONFIG: Record<HealthStatus, { intent: BadgeProps['intent']; icon: ReactNode; label: string }> = {
  healthy:     { intent: 'success',     icon: <CheckCircle2 className="h-3 w-3" />, label: 'Healthy'     },
  degraded:    { intent: 'warning',     icon: <AlertTriangle className="h-3 w-3" />,label: 'Degraded'    },
  down:        { intent: 'destructive', icon: <XCircle      className="h-3 w-3" />, label: 'Down'        },
  maintenance: { intent: 'info',        icon: <RefreshCw    className="h-3 w-3" />, label: 'Maintenance' },
};

export interface HealthBadgeProps extends Omit<BadgeProps, 'intent'> {
  health: HealthStatus;
}

export function HealthBadge({ health, variant = 'subtle', size, className, ...props }: HealthBadgeProps) {
  const cfg = HEALTH_CONFIG[health];
  return (
    <Badge intent={cfg.intent} variant={variant} size={size} className={className} {...props}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

/* ---------------------------------------------------------------------------
 * ConnectionBadge
 * ---------------------------------------------------------------------------
 * Shows online/offline/syncing with an animated dot for live indicators.
 * ------------------------------------------------------------------------- */

export type ConnectionState = 'online' | 'offline' | 'syncing';

const CONNECTION_CONFIG: Record<ConnectionState, { intent: BadgeProps['intent']; icon: ReactNode; label: string; pulse?: boolean }> = {
  online:  { intent: 'success',     icon: <Wifi     className="h-3 w-3" />, label: 'Online',  pulse: true  },
  offline: { intent: 'destructive', icon: <WifiOff  className="h-3 w-3" />, label: 'Offline', pulse: false },
  syncing: { intent: 'warning',     icon: <Loader2  className="h-3 w-3 animate-spin" />, label: 'Syncing', pulse: false },
};

export interface ConnectionBadgeProps extends Omit<BadgeProps, 'intent'> {
  connection: ConnectionState;
}

export function ConnectionBadge({ connection, variant = 'subtle', size, className, ...props }: ConnectionBadgeProps) {
  const cfg = CONNECTION_CONFIG[connection];
  return (
    <Badge intent={cfg.intent} variant={variant} size={size} className={className} {...props}>
      {cfg.pulse && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      {!cfg.pulse && cfg.icon}
      {cfg.label}
    </Badge>
  );
}
