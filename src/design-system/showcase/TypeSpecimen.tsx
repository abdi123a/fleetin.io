import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/utils';

import { CopyableToken } from './CopyableToken';

/**
 * TypeSpecimen — documents one level of the type scale.
 *
 * Renders live sample text in the level itself, then measures the rendered node
 * for its size, line height and weight. Nothing about the metrics is restated
 * by hand, so the spec column cannot drift from the CSS the way a catalogue of
 * hardcoded "22px / 1.25 / 600" strings inevitably would.
 */

interface TypeMetrics {
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
}

const EMPTY_METRICS: TypeMetrics = { fontSize: '—', lineHeight: '—', fontWeight: '—' };

/** Formats line height as a unitless ratio, which is how the token declares it. */
function toRatio(lineHeightPx: string, fontSizePx: string): string {
  const lineHeight = Number.parseFloat(lineHeightPx);
  const fontSize = Number.parseFloat(fontSizePx);

  if (!Number.isFinite(lineHeight) || !Number.isFinite(fontSize) || fontSize === 0) {
    return lineHeightPx;
  }

  return `${(lineHeight / fontSize).toFixed(3).replace(/\.?0+$/, '')} · ${Math.round(lineHeight)}px`;
}

export interface TypeSpecimenProps {
  /** Level name, e.g. "Heading 1". */
  name: string;
  /** Utility class that applies the level, e.g. `type-h1`. */
  utility: string;
  /** Underlying primitive token, e.g. `--fl-text-2xl`. */
  token: string;
  /** Sample text for this level. */
  sample?: string;
  /** Where the level should be used. */
  usage?: string;
  className?: string;
}

export function TypeSpecimen({
  name,
  utility,
  token,
  sample = 'Fleet operations at a glance',
  usage,
  className,
}: TypeSpecimenProps) {
  const sampleRef = useRef<HTMLParagraphElement>(null);
  const [metrics, setMetrics] = useState<TypeMetrics>(EMPTY_METRICS);

  useLayoutEffect(() => {
    const element = sampleRef.current;
    if (!element) return;

    const measure = () => {
      const computed = getComputedStyle(element);
      setMetrics({
        fontSize: `${Math.round(Number.parseFloat(computed.fontSize))}px`,
        lineHeight: toRatio(computed.lineHeight, computed.fontSize),
        fontWeight: computed.fontWeight,
      });
    };

    measure();

    // The variable font resolves after first paint; a metric measured against
    // the fallback face would be wrong for weight in particular.
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
    };
  }, [utility]);

  return (
    <div
      className={cn(
        'grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p ref={sampleRef} className={cn(utility, 'truncate text-foreground')}>
          {sample}
        </p>
        <p className="type-caption text-muted-foreground">
          {name}
          {usage && <span className="text-muted-foreground/70"> — {usage}</span>}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-2">
        <SpecPair label="Class">
          <CopyableToken label={utility} emphasis="strong" />
        </SpecPair>
        <SpecPair label="Size token">
          <CopyableToken label={token} />
        </SpecPair>
        <SpecPair label="Size">
          <span className="type-mono text-muted-foreground">{metrics.fontSize}</span>
        </SpecPair>
        <SpecPair label="Line height">
          <span className="type-mono text-muted-foreground">{metrics.lineHeight}</span>
        </SpecPair>
        <SpecPair label="Weight">
          <span className="type-mono text-muted-foreground">{metrics.fontWeight}</span>
        </SpecPair>
      </dl>
    </div>
  );
}

function SpecPair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="type-label text-muted-foreground/80">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
