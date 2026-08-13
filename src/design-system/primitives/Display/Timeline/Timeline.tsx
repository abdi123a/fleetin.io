import {
  Check,
  CheckCircle2,
  Circle,
  Edit3,
  FileText,
  MoreVertical,
  Trash2,
  User,
  X,
  XCircle,
} from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ===========================================================================
 * Timeline
 * =========================================================================== */

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  children: ReactNode;
}

export const Timeline = forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  { children, className, ...props },
  ref,
) {
  return (
    <ol ref={ref} className={cn('space-y-0', className)} {...props}>
      {children}
    </ol>
  );
});

/* ===========================================================================
 * TimelineItem
 * =========================================================================== */

export type TimelineItemStatus = 'completed' | 'current' | 'upcoming' | 'error';

export interface TimelineItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  /** Icon node centred in the bullet. */
  icon?: ReactNode;
  /** Primary label. */
  title: ReactNode;
  /** Supporting detail. */
  description?: ReactNode;
  /** Timestamp string. */
  timestamp?: string;
  /** Controls bullet colour. */
  status?: TimelineItemStatus;
  /** Whether this is the last item (hides the connector line). */
  last?: boolean;
}

const bulletClasses: Record<TimelineItemStatus, string> = {
  completed: 'bg-primary text-primary-foreground',
  current:   'bg-surface ring-2 ring-primary text-primary',
  upcoming:  'bg-surface ring-2 ring-border text-muted-foreground',
  error:     'bg-destructive text-destructive-foreground',
};

export const TimelineItem = forwardRef<HTMLLIElement, TimelineItemProps>(function TimelineItem(
  { icon, title, description, timestamp, status = 'upcoming', last = false, className, ...props },
  ref,
) {
  return (
    <li ref={ref} className={cn('relative flex gap-4', className)} {...props}>
      {/* Connector */}
      <div className="flex flex-col items-center">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs', bulletClasses[status])}>
          {icon ?? (status === 'completed' ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />)}
        </div>
        {!last && <div className="mt-1 w-px flex-1 bg-border min-h-[1.5rem]" />}
      </div>
      {/* Content */}
      <div className={cn('flex-1 pb-6', last && 'pb-0')}>
        <div className="flex items-start justify-between gap-2">
          <span className="type-body-sm font-medium text-foreground leading-7">{title}</span>
          {timestamp && <span className="type-body-xs text-muted-foreground whitespace-nowrap mt-1">{timestamp}</span>}
        </div>
        {description && (
          <p className="type-body-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </li>
  );
});

/* ===========================================================================
 * ActivityTimeline
 * =========================================================================== */

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target?: string;
  timestamp: string;
  icon?: ReactNode;
  status?: TimelineItemStatus;
}

export interface ActivityTimelineProps extends HTMLAttributes<HTMLOListElement> {
  events: ActivityEvent[];
}

export function ActivityTimeline({ events, className, ...props }: ActivityTimelineProps) {
  return (
    <Timeline className={className} {...props}>
      {events.map((event, idx) => (
        <TimelineItem
          key={event.id}
          status={event.status ?? 'completed'}
          icon={event.icon ?? <User className="h-3.5 w-3.5" />}
          title={
            <span>
              <span className="font-semibold">{event.actor}</span>{' '}
              <span className="text-muted-foreground font-normal">{event.action}</span>
              {event.target && <span className="font-semibold"> {event.target}</span>}
            </span>
          }
          timestamp={event.timestamp}
          last={idx === events.length - 1}
        />
      ))}
    </Timeline>
  );
}

/* ===========================================================================
 * ApprovalTimeline
 * =========================================================================== */

export type ApprovalStepStatus = 'approved' | 'rejected' | 'pending' | 'skipped';

export interface ApprovalStep {
  id: string;
  label: string;
  approver?: string;
  status: ApprovalStepStatus;
  timestamp?: string;
  note?: string;
}

export interface ApprovalTimelineProps extends HTMLAttributes<HTMLOListElement> {
  steps: ApprovalStep[];
}

const APPROVAL_ICON: Record<ApprovalStepStatus, ReactNode> = {
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle     className="h-3.5 w-3.5" />,
  pending:  <Circle      className="h-2.5 w-2.5" />,
  skipped:  <X           className="h-3.5 w-3.5" />,
};

const APPROVAL_STATUS: Record<ApprovalStepStatus, TimelineItemStatus> = {
  approved: 'completed',
  rejected: 'error',
  pending:  'current',
  skipped:  'upcoming',
};

export function ApprovalTimeline({ steps, className, ...props }: ApprovalTimelineProps) {
  return (
    <Timeline className={className} {...props}>
      {steps.map((step, idx) => (
        <TimelineItem
          key={step.id}
          status={APPROVAL_STATUS[step.status]}
          icon={APPROVAL_ICON[step.status]}
          title={step.label}
          description={
            step.approver || step.note ? (
              <span>
                {step.approver && <span className="font-medium">{step.approver}</span>}
                {step.note && <span className="text-muted-foreground"> — {step.note}</span>}
              </span>
            ) : undefined
          }
          timestamp={step.timestamp}
          last={idx === steps.length - 1}
        />
      ))}
    </Timeline>
  );
}

/* ===========================================================================
 * AuditTimeline
 * =========================================================================== */

export type AuditAction = 'created' | 'updated' | 'deleted' | 'viewed' | 'approved' | 'rejected' | 'other';

export interface AuditEntry {
  id: string;
  actor: string;
  action: AuditAction;
  resource: string;
  details?: string;
  timestamp: string;
}

export interface AuditTimelineProps extends HTMLAttributes<HTMLOListElement> {
  entries: AuditEntry[];
}

const AUDIT_ICON: Record<AuditAction, ReactNode> = {
  created:  <FileText   className="h-3.5 w-3.5" />,
  updated:  <Edit3      className="h-3.5 w-3.5" />,
  deleted:  <Trash2     className="h-3.5 w-3.5" />,
  viewed:   <User       className="h-3.5 w-3.5" />,
  approved: <Check      className="h-3.5 w-3.5" />,
  rejected: <X          className="h-3.5 w-3.5" />,
  other:    <MoreVertical className="h-3.5 w-3.5" />,
};

const AUDIT_STATUS: Record<AuditAction, TimelineItemStatus> = {
  created: 'completed', updated: 'completed', deleted: 'error',
  viewed: 'upcoming', approved: 'completed', rejected: 'error', other: 'completed',
};

export function AuditTimeline({ entries, className, ...props }: AuditTimelineProps) {
  return (
    <Timeline className={className} {...props}>
      {entries.map((entry, idx) => (
        <TimelineItem
          key={entry.id}
          status={AUDIT_STATUS[entry.action]}
          icon={AUDIT_ICON[entry.action]}
          title={
            <span>
              <span className="font-semibold">{entry.actor}</span>{' '}
              <span className="text-muted-foreground font-normal">{entry.action}</span>{' '}
              <span className="font-semibold">{entry.resource}</span>
            </span>
          }
          description={entry.details}
          timestamp={entry.timestamp}
          last={idx === entries.length - 1}
        />
      ))}
    </Timeline>
  );
}
