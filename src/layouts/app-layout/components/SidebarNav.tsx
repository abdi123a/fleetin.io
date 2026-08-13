import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { getNavigationForUser } from '@/config/navigation';
import { ScrollArea } from '@/design-system';
import { useUiStore, useAuthStore, useAccessRequestStore } from '@/stores';
import type { NavItem, NavSection } from '@/types';
import { cn } from '@/utils';

import { SidebarNavItem } from './SidebarNavItem';
import { SlidingIndicator, type Rect } from './SlidingIndicator';

/**
 * Stamps a pending-request count onto the "administration" nav row. Kept
 * here rather than in `getNavigationForUser` (a plain function) because the
 * count is live store state — computing it needs a hook.
 */
function withAdministrationBadge(sections: NavSection[], pendingCount: number): NavSection[] {
  if (pendingCount <= 0) return sections;

  const stampItem = (item: NavItem): NavItem =>
    item.id === 'administration'
      ? { ...item, badge: pendingCount }
      : item.children
        ? { ...item, children: item.children.map(stampItem) }
        : item;

  return sections.map((section) => ({ ...section, items: section.items.map(stampItem) }));
}

/**
 * SidebarNav — renders the navigation tree from config.
 *
 * Includes liquid sliding indicator animation from fleetin.io.
 */

export interface SidebarNavProps {
  isCollapsed: boolean;
  onNavigate?: () => void;
  className?: string;
}

export function SidebarNav({ isCollapsed, onNavigate, className }: SidebarNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const { pathname } = useLocation();
  const expandedNavGroups = useUiStore((state) => state.expandedNavGroups);
  const user = useAuthStore((state) => state.user);
  const pendingAccessRequests = useAccessRequestStore(
    (state) => state.requests.filter((r) => r.status === 'PENDING').length,
  );

  const navigationSections = useMemo(
    () => withAdministrationBadge(getNavigationForUser(user), pendingAccessRequests),
    [user, pendingAccessRequests],
  );

  useLayoutEffect(() => {
    const container = navRef.current;
    if (!container) return;

    const updateRect = () => {
      const activeEl = container.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeEl) {
        setRect(null);
        return;
      }

      // Check if element is in a closed collapsible branch or hidden
      const isClosedParent = Boolean(activeEl.closest('[data-state="closed"]'));
      const elRect = activeEl.getBoundingClientRect();
      const isVisible =
        !isClosedParent &&
        elRect.width > 0 &&
        elRect.height > 0 &&
        (activeEl.offsetParent !== null || window.getComputedStyle(activeEl).position === 'fixed');

      if (!isVisible) {
        setRect(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();

      setRect({
        top: elRect.top - containerRect.top,
        left: elRect.left - containerRect.left,
        width: elRect.width,
        height: elRect.height,
      });
    };

    updateRect();

    // Observe size changes of container and child menu elements
    const resizeObserver = new ResizeObserver(() => {
      updateRect();
    });
    resizeObserver.observe(container);

    const observeChildren = () => {
      const childElements = container.querySelectorAll('ul, [data-state], button');
      childElements.forEach((el) => resizeObserver.observe(el));
    };
    observeChildren();

    const handleTransition = () => updateRect();
    container.addEventListener('transitionend', handleTransition);
    container.addEventListener('animationend', handleTransition);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('transitionend', handleTransition);
      container.removeEventListener('animationend', handleTransition);
    };
  }, [pathname, isCollapsed, expandedNavGroups, user]);

  return (
    <ScrollArea className={cn('flex-1', className)} viewportClassName="px-3 py-4">
      <nav ref={navRef} aria-label="Main navigation" className="relative space-y-6">
        <SlidingIndicator rect={rect} />
        {navigationSections.map((section) => (
          <div key={section.id} className="space-y-1">
            {section.label &&
              (isCollapsed ? (
                // The rail has no room for a caption; a rule keeps the grouping
                // legible without it.
                <div className="mx-auto my-2 h-px w-6 bg-sidebar-border" aria-hidden />
              ) : (
                <div className="mb-2 flex items-center gap-2.5 px-2.5 pt-1">
                  <span className="type-label font-bold tracking-widest text-sidebar-muted-foreground">
                    {section.label}
                  </span>
                  <span className="h-px flex-1 bg-sidebar-border" />
                </div>
              ))}

            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  <SidebarNavItem
                    item={item}
                    isCollapsed={isCollapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

