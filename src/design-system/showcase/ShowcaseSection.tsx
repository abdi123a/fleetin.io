import type { ReactNode } from 'react';

import { cn } from '@/utils';

/**
 * Layout scaffolding for the design-system documentation.
 *
 * Sections, subsections and the panels inside them all render through these,
 * so every part of the showcase shares one heading rhythm and one surface
 * treatment. Adding a section is a matter of composing these — never
 * re-inventing a heading or a bordered box.
 */

export interface ShowcaseSectionProps {
  /** Anchor target, used by the on-page contents nav. */
  id: string;
  /** Section number shown in the eyebrow, e.g. "01". */
  index?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function ShowcaseSection({
  id,
  index,
  title,
  description,
  children,
  className,
}: ShowcaseSectionProps) {
  return (
    <section
      id={id}
      // Offsets the anchor so the sticky header does not cover the heading.
      className={cn('scroll-mt-24 space-y-6', className)}
      aria-labelledby={`${id}-heading`}
    >
      <header className="space-y-1.5 border-b border-border pb-4">
        {index && <p className="type-label text-primary">Section {index}</p>}
        <h2 id={`${id}-heading`} className="type-h1 text-foreground">
          {title}
        </h2>
        {description && (
          <p className="type-body max-w-3xl text-muted-foreground">{description}</p>
        )}
      </header>

      {children}
    </section>
  );
}

export interface ShowcaseSubsectionProps {
  title: string;
  description?: string;
  /** Rendered opposite the title — usually a legend or a count. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ShowcaseSubsection({
  title,
  description,
  aside,
  children,
  className,
}: ShowcaseSubsectionProps) {
  return (
    <div className={cn('space-y-3.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="space-y-0.5">
          <h3 className="type-h4 text-foreground">{title}</h3>
          {description && (
            <p className="type-body-sm max-w-3xl text-muted-foreground">{description}</p>
          )}
        </div>
        {aside && <div className="type-caption text-muted-foreground">{aside}</div>}
      </div>

      {children}
    </div>
  );
}

export interface ShowcasePanelProps {
  children: ReactNode;
  /** `flush` removes padding for panels whose children own their own spacing. */
  padding?: 'default' | 'flush';
  className?: string;
}

/** The bordered surface every specimen grid sits on. */
export function ShowcasePanel({ children, padding = 'default', className }: ShowcasePanelProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border bg-surface shadow-xs',
        padding === 'default' && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ShowcaseGridProps {
  children: ReactNode;
  /** Minimum column width before wrapping; drives the auto-fill track. */
  minColumnWidth?: string;
  className?: string;
}

/**
 * Auto-filling responsive grid.
 *
 * Uses an inline `gridTemplateColumns` because the track size is a per-grid
 * decision (colour swatches, icon tiles and shadow cards want different
 * minimums) and a Tailwind arbitrary value would be a different class each time.
 */
export function ShowcaseGrid({
  children,
  minColumnWidth = '13rem',
  className,
}: ShowcaseGridProps) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minColumnWidth}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

export interface SpecRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** One `label / value` line inside a specimen card. */
export function SpecRow({ label, children, className }: SpecRowProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <dt className="type-caption shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
