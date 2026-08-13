import { AlertTriangle, Inbox, Lock, SearchX, WifiOff } from '@/design-system/icons';

import type { ReactNode } from 'react';

import { EmptyState, type EmptyStateSize } from '@/design-system/primitives/Layout';
import { cn } from '@/utils';

import type { DataTableStateKind } from './types';

/**
 * DataTableEmptyState — the non-loading states a table body can be in.
 *
 * `EnterpriseDataTable` selects `kind` automatically (no data vs. no data
 * matching the current search/filters vs. a fetch error vs. offline vs.
 * permission denied) and renders this inside a full-width row. Every string
 * is overridable per call site.
 */

export type DataTableEmptyStateKind = Exclude<DataTableStateKind, 'loading'>;

export interface DataTableEmptyStateProps {
  kind: DataTableEmptyStateKind;
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  size?: EmptyStateSize;
  className?: string;
}

const STATE_DEFAULTS: Record<
  DataTableEmptyStateKind,
  { icon: ReactNode; title: string; description: string }
> = {
  'no-data': {
    icon: <Inbox className="h-6 w-6" />,
    title: 'No records yet',
    description: 'Data will show up here once it has been added.',
  },
  'no-results': {
    icon: <SearchX className="h-6 w-6" />,
    title: 'No results found',
    description: 'Try adjusting your search or filters.',
  },
  error: {
    icon: <AlertTriangle className="h-6 w-6" />,
    title: 'Something went wrong',
    description: "We couldn't load this data. Please try again.",
  },
  'permission-denied': {
    icon: <Lock className="h-6 w-6" />,
    title: 'Access restricted',
    description: "You don't have permission to view this data.",
  },
  offline: {
    icon: <WifiOff className="h-6 w-6" />,
    title: "You're offline",
    description: 'Check your connection and try again.',
  },
};

export function DataTableEmptyState({
  kind,
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  size = 'md',
  className,
}: DataTableEmptyStateProps) {
  const defaults = STATE_DEFAULTS[kind];

  return (
    <EmptyState
      className={cn(className)}
      icon={icon ?? defaults.icon}
      title={title ?? defaults.title}
      description={description ?? defaults.description}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      size={size}
    />
  );
}
