import { cn } from '@/utils';
import { intentColor } from './chartTheme';

/**
 * A rate as an arc, with its target marked.
 *
 * The arc exists to answer "are we where we should be" pre-attentively — the
 * gap between the fill and the target tick is the whole message, and it is
 * visible before the number is read. Drawn as two SVG paths rather than a
 * Recharts radial chart: at one value the library is all overhead, and this way
 * the target marker sits exactly on the arc.
 *
 * Colour is severity here, not identity, so it comes from the status scale and
 * is always accompanied by the printed percentage — never colour alone.
 */

export interface RateGaugeProps {
  /** 0–1. */
  value: number;
  /** 0–1. Draws a tick on the arc when provided. */
  target?: number;
  label?: string;
  size?: number;
  className?: string;
}

const RADIUS = 42;
const CIRCUMFERENCE = Math.PI * RADIUS; // half circle

export function RateGauge({ value, target, label, size = 132, className }: RateGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));

  // Severity bands: comfortably clear of target, near it, or under it. With no
  // target the bands fall back to conventional service-level expectations.
  const threshold = target ?? 0.9;
  const intent =
    clamped >= threshold ? 'good' : clamped >= threshold - 0.1 ? 'warning' : 'critical';
  const color = intentColor(intent);

  const arc = `M 8 ${RADIUS + 8} A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 2 + 8} ${RADIUS + 8}`;
  const targetAngle = target === undefined ? undefined : Math.PI * (1 - target);

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <svg
        width={size}
        height={size * 0.62}
        viewBox={`0 0 ${RADIUS * 2 + 16} ${RADIUS + 20}`}
        role="img"
        aria-label={`${label ?? 'Rate'}: ${(clamped * 100).toFixed(1)} percent${
          target !== undefined ? `, target ${(target * 100).toFixed(0)} percent` : ''
        }`}
      >
        {/* Track: a lighter step of the same ramp, so state reads across the
            whole arc rather than only where it is filled. */}
        <path
          d={arc}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
        {targetAngle !== undefined ? (
          <line
            x1={RADIUS + 8 + Math.cos(targetAngle) * (RADIUS - 6)}
            y1={RADIUS + 8 - Math.sin(targetAngle) * (RADIUS - 6)}
            x2={RADIUS + 8 + Math.cos(targetAngle) * (RADIUS + 6)}
            y2={RADIUS + 8 - Math.sin(targetAngle) * (RADIUS + 6)}
            stroke="var(--primary)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ) : null}
      </svg>

      <div className="-mt-7 flex flex-col items-center">
        <span className="text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
          {(clamped * 100).toFixed(1)}%
        </span>
        {target !== undefined ? (
          <span className="mt-1 text-[10px] text-muted-foreground">
            target {(target * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
