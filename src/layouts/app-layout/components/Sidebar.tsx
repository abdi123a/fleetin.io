import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from '@/design-system/icons';

import { Logo, ThemeToggle } from '@/components';
import { IconButton, Tooltip } from '@/design-system';
import { ROUTES } from '@/config/routes';
import { useUiStore } from '@/stores';
import { cn } from '@/utils';

import { SidebarNav } from './SidebarNav';

/**
 * Sidebar — the docked desktop navigation panel.
 *
 * Rendered in two widths driven by `isCollapsed`: the full panel and a 72px
 * icon rail. The same component body is reused inside the mobile drawer (always
 * expanded there), so navigation markup exists in exactly one place.
 *
 * The expand/collapse control changes seat with the state: parked in the
 * panel's top-right corner and always visible while expanded, then hidden once
 * collapsed — the rail has no corner to spare, so it is revealed by hovering
 * the logo mark instead.
 */

export interface SidebarProps {
  isCollapsed: boolean;
  /** Invoked after navigating — closes the drawer on mobile. */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ isCollapsed, onNavigate, className }: SidebarProps) {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const toggleLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  const renderToggle = (buttonClassName: string) => (
    <Tooltip content={toggleLabel} side={isCollapsed ? 'right' : 'bottom'}>
      <IconButton
        aria-label={toggleLabel}
        size="sm"
        onClick={toggleSidebar}
        className={buttonClassName}
      >
        {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </IconButton>
    </Tooltip>
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      {/* Brand — seats the toggle in the corner, or over the logo once collapsed */}
      <div
        className={cn(
          'group/brand relative flex min-h-[4.25rem] shrink-0 items-center border-b border-sidebar-border py-3.5',
          // Expanded on desktop reserves the corner for the toggle; the mobile
          // drawer has no toggle, so it keeps the symmetric padding.
          isCollapsed ? 'justify-center px-3' : 'justify-start px-5 lg:pr-14',
        )}
      >
        <Link
          to={ROUTES.dashboard}
          onClick={onNavigate}
          className="inline-flex min-w-0 items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {/* No hover fill here on purpose — a brand mark isn't a nav item
              and a background box behind it read as a stray hover glitch.
              `variant="white"` only affects the expanded wordmark: the
              collapsed icon glyph ignores it and keeps its natural teal,
              since forcing that one white erases it into a blank circle —
              see the note in Logo.tsx. */}
          <Logo iconOnly={isCollapsed} size={isCollapsed ? 'lg' : '2xl'} variant="white" />
        </Link>

        {isCollapsed ? (
          // The rail has no corner to spare, so the control takes the logo's
          // place while the row is hovered or the button is keyboard-focused.
          <div
            className={cn(
              // No fade: it must clear the logo the instant the cursor leaves.
              'pointer-events-none absolute inset-0 hidden items-center justify-center bg-sidebar opacity-0',
              'group-hover/brand:pointer-events-auto group-hover/brand:opacity-100',
              // Focus is scoped to the button itself — `focus-within` on the row
              // would let a click on the logo link pin the overlay open.
              'has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100',
              'lg:flex',
            )}
          >
            {renderToggle('bg-surface text-foreground shadow-sm hover:bg-muted')}
          </div>
        ) : (
          <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
            {renderToggle(
              'text-sidebar-foreground hover:bg-sidebar-item-hover hover:text-sidebar-item-hover-foreground',
            )}
          </div>
        )}
      </div>

      <SidebarNav isCollapsed={isCollapsed} onNavigate={onNavigate} />

      {/* Footer: theme control only */}
      <div
        className={cn(
          'shrink-0 border-t border-sidebar-border p-3',
          isCollapsed ? 'flex justify-center px-2 py-3' : 'flex items-center',
        )}
      >
        <ThemeToggle variant={isCollapsed ? 'compact' : 'full'} tone="sidebar" />
      </div>
    </div>
  );
}
