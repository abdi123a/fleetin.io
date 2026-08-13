import { useEffect } from 'react';
import { ChevronRight } from '@/design-system/icons';

import { Link, useLocation } from 'react-router-dom';

import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip } from '@/design-system';
import { useNavigationState } from '@/hooks';
import { useUiStore } from '@/stores';
import type { NavItem } from '@/types';
import { cn } from '@/utils';

/**
 * SidebarNavItem — one row of the sidebar, recursive over `children`.
 *
 * The panel is brand teal, so every colour here comes from a `--sidebar-*`
 * role rather than the page palette: `text-foreground` and `text-primary` are
 * mixed for a white canvas and disappear against teal.
 *
 * Type is deliberately heavier than the rest of the app — 14px semibold idle,
 * bold when active. Navigation is read at a glance and from the corner of the
 * eye, so the usual 13px medium is the wrong weight for it, and a coloured
 * panel eats apparent contrast that a white one gives away for free.
 */

export interface SidebarNavItemProps {
  item: NavItem;
  /** Nesting level; drives the indent of child rows. */
  depth?: number;
  /** True when the sidebar is reduced to the icon rail. */
  isCollapsed: boolean;
  /** Invoked after navigating — used to close the mobile drawer. */
  onNavigate?: () => void;
}

const ROW_BASE = [
  'group/nav-item relative z-10 flex w-full items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2',
  'type-body tracking-tight transition-colors duration-fast ease-out',
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
];

/** Idle rows stay legible on their own; hover only lifts them the last step. */
const ROW_IDLE =
  'font-semibold text-sidebar-foreground hover:bg-sidebar-item-hover hover:text-sidebar-item-hover-foreground';

/**
 * Active sits on the cream pill the SlidingIndicator paints underneath, so it
 * takes the pill's inverse. Only the leaf marked `aria-current` gets a pill.
 */
const ROW_ACTIVE = 'font-bold text-sidebar-item-active-foreground';

/**
 * A group whose child is the current page. It carries no pill, so it cannot
 * borrow the active colour — dark teal on the teal panel is invisible. It
 * separates from idle by weight and by going the whole way to cream.
 */
const ROW_BRANCH =
  'font-bold text-sidebar-item-hover-foreground hover:bg-sidebar-item-hover';

const ICON_IDLE =
  'text-sidebar-foreground group-hover/nav-item:text-sidebar-item-hover-foreground';
const ICON_ACTIVE = 'text-sidebar-item-active-foreground';
const ICON_BRANCH = 'text-sidebar-item-hover-foreground';

export function SidebarNavItem({
  item,
  depth = 0,
  isCollapsed,
  onNavigate,
}: SidebarNavItemProps) {
  const { pathname } = useLocation();
  const { isItemActive, isBranchActive } = useNavigationState();
  const expandedNavGroups = useUiStore((state) => state.expandedNavGroups);
  const toggleNavGroup = useUiStore((state) => state.toggleNavGroup);
  const setNavGroupExpanded = useUiStore((state) => state.setNavGroupExpanded);

  const hasChildren = Boolean(item.children?.length);
  const isActive = isItemActive(item);
  const isBranch = isBranchActive(item);

  // Auto-expand branch when navigating to a child route
  useEffect(() => {
    if (hasChildren && isBranch) {
      setNavGroupExpanded(item.id, true);
    }
  }, [pathname, isBranch, hasChildren, item.id, setNavGroupExpanded]);

  /* ---------------------------------------------------------------- group */

  if (hasChildren) {
    const isOpen = expandedNavGroups.includes(item.id);

    if (isCollapsed) {
      return (
        <Tooltip content={item.label} side="right">
          <button
            type="button"
            aria-label={item.label}
            onClick={() => {
              useUiStore.getState().setSidebarCollapsed(false);
              toggleNavGroup(item.id);
            }}
            className={cn(
              ROW_BASE,
              'justify-center px-0 py-2',
              isBranch ? ROW_BRANCH : ROW_IDLE,
            )}
          >
            {item.icon && (
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-200',
                  isBranch ? ICON_BRANCH : ICON_IDLE,
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              </span>
            )}
          </button>
        </Tooltip>
      );
    }

    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleNavGroup(item.id)}>
        <CollapsibleTrigger
          className={cn(ROW_BASE, isBranch ? ROW_BRANCH : ROW_IDLE)}
        >
          {item.icon && (
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-md transition-all duration-200',
                depth > 0 ? 'h-6 w-6' : 'h-7 w-7',
                isBranch ? ICON_BRANCH : ICON_IDLE,
              )}
            >
              <item.icon className={cn('shrink-0', depth > 0 ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
            </span>
          )}
          <span className="flex-1 truncate text-left">{item.label}</span>
          <ChevronRight
            className={cn(
              'size-4 shrink-0 transition-transform duration-normal ease-emphasized',
              isOpen && 'rotate-90',
            )}
            aria-hidden
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border pl-2.5">
            {item.children?.map((child) => (
              <li key={child.id}>
                <SidebarNavItem
                  item={child}
                  depth={depth + 1}
                  isCollapsed={isCollapsed}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  /* ----------------------------------------------------------------- leaf */

  if (!item.path) return null;

  const row = (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-disabled={item.disabled || undefined}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        ROW_BASE,
        isCollapsed && 'justify-center px-0 py-2',
        item.disabled && 'pointer-events-none opacity-50',
        isActive ? ROW_ACTIVE : ROW_IDLE,
      )}
    >
      {item.icon && (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md transition-all duration-200',
            depth > 0 ? 'h-6 w-6' : 'h-7 w-7',
            isActive ? ICON_ACTIVE : ICON_IDLE,
          )}
        >
          <item.icon className={cn('shrink-0', depth > 0 ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
        </span>
      )}

      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <Badge
              size="sm"
              intent={isActive ? 'primary' : 'default'}
              className={cn(
                'ml-auto',
                // The default badge is mixed for a white canvas; on teal it
                // needs its own pair or it reads as a smudge.
                !isActive && 'bg-sidebar-item-hover text-sidebar-item-hover-foreground',
              )}
            >
              {item.badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );

  return isCollapsed ? (
    <Tooltip content={item.label} side="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
}
