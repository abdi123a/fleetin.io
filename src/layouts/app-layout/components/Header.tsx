import { Menu } from '@/design-system/icons';

import { IconButton } from '@/design-system';
import { cn } from '@/utils';

import { NotificationBell } from '@/features/workspace';


/**
 * Header — the sticky top bar of the application shell.
 *
 * Holds the mobile navigation trigger, breadcrumb trail and account controls.
 * Desktop sidebar expand/collapse lives on the sidebar logo (hover to reveal).
 */

export interface HeaderProps {
  /** Opens the mobile navigation drawer. */
  onOpenMobileNav: () => void;
  className?: string;
}

export function Header({ onOpenMobileNav, className }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-header flex h-header shrink-0 items-center gap-3',
        'border-b border-header-border bg-header/95 px-4 backdrop-blur-sm lg:px-6',
        className,
      )}
    >
      <IconButton
        aria-label="Open navigation menu"
        size="sm"
        onClick={onOpenMobileNav}
        className="lg:hidden"
      >
        <Menu />
      </IconButton>

      {/* No breadcrumbs. Every page already names itself in its own `PageHeader`
          — "Empty Container / Cycles" was printed twice, six millimetres apart,
          and the trail's only unique link was "Dashboard", which the sidebar
          holds permanently. A row of chrome that repeats the page title is a row
          of chrome. The spacer keeps the bell at the right edge. */}
      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationBell />

      </div>
    </header>
  );
}
