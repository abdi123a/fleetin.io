import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/utils';

/**
 * ShowcaseContents — sticky in-page navigation for the showcase.
 *
 * Tracks which section is in view with an IntersectionObserver rather than a
 * scroll handler, so the highlight costs nothing on the main thread while the
 * (very long) page scrolls.
 */

export interface ShowcaseContentsEntry {
  id: string;
  label: string;
}

export interface ShowcaseContentsGroup {
  /** Caption above the group, e.g. "Foundations". */
  label: string;
  entries: ShowcaseContentsEntry[];
}

export interface ShowcaseContentsProps {
  groups: ShowcaseContentsGroup[];
  className?: string;
}

export function ShowcaseContents({ groups, className }: ShowcaseContentsProps) {
  // Flattened in document order — the tracker needs one ordered list, while the
  // rendered nav keeps the grouping.
  const entries = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
  const activeId = useActiveSection(entries);

  return (
    <nav aria-label="Design system sections" className={cn('space-y-4', className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="type-label mb-1.5 px-3 text-muted-foreground">{group.label}</p>
          <ul className="space-y-0.5">
            {group.entries.map((entry) => {
              const isActive = entry.id === activeId;

              return (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-1.5 type-body-sm transition-colors duration-fast',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      isActive
                        ? 'bg-primary-subtle font-medium text-primary-subtle-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {entry.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Distance below the sticky header at which a section counts as "current". */
const ANCHOR_OFFSET_PX = 96;

/**
 * Returns the id of the section the reader is currently inside.
 *
 * Computed from section positions rather than an IntersectionObserver. An
 * observer answers "is this element in a band", which leaves two cases
 * unanswered on a page like this one: at the very top no section has reached
 * the band yet, and at the very bottom the last short section may never fill
 * it — in both, the highlight sticks to whatever was seen last. Asking instead
 * for "the last section whose heading has passed the anchor line" is always
 * defined, and for six anchors the arithmetic is far cheaper than the observer
 * bookkeeping it replaces.
 *
 * Reads are throttled to one per animation frame, so scrolling stays free of
 * layout thrash.
 */
function useActiveSection(entries: ShowcaseContentsEntry[]): string | undefined {
  const [activeId, setActiveId] = useState<string | undefined>(entries[0]?.id);
  const entryKey = entries.map((entry) => entry.id).join('|');

  useEffect(() => {
    const ids = entryKey.split('|').filter(Boolean);
    if (ids.length === 0) return;

    let frame = 0;

    const resolveActive = () => {
      frame = 0;

      let current = ids[0];

      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;

        // Once a section's top passes the anchor line, the reader is inside it;
        // the last such section wins.
        if (element.getBoundingClientRect().top <= ANCHOR_OFFSET_PX) current = id;
      }

      // The final section is often shorter than the viewport, so it can never
      // reach the anchor line. Bottom-of-page always means the last section.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) current = ids[ids.length - 1];

      setActiveId(current);
    };

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(resolveActive);
    };

    resolveActive();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [entryKey]);

  return activeId;
}
