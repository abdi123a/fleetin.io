import { cn } from '@/utils';
import { intentColor, type Intent } from './chartTheme';

/**
 * A small progress ring with its percentage in the middle.
 *
 * Sits where a stat tile would, when the number is a *share of something* —
 * the ring turns "5" into "5 of 15" pre-attentively, which a bare figure with
 * a caption cannot do. Three of these side by side read as one distribution
 * without needing a legend or a shared axis.
 *
 * Colour is severity, not identity, so it comes from the status scale and is
 * always printed as a number too — never colour alone.
 */

export interface MiniGaugeProps {
  /** 0–1. */
  value: number;
  /** The count behind the share, printed under the ring. */
  count?: number;
  label: string;
  intent?: Intent;
  /** Short qualifier under the label — "units", "of 15 containers". */
  caption?: string;
  size?: number;
  onClick?: () => void;
  className?: string;
}

const R = 42;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function MiniGauge({
  value,
  count,
  label,
  intent = 'neutral',
  caption,
  size = 104,
  onClick,
  className,
}: MiniGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const color = intentColor(intent);

  const body = (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${label}: ${(clamped * 100).toFixed(1)} percent${
          count === undefined ? '' : `, ${count} units`
        }`}
      >
        {/* Track: one step off the surface, so the unfilled remainder still
            reads as part of the same object rather than empty space. */}
        <circle cx={50} cy={50} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform="rotate(-90 50 50)"
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
        <text
          x={50}
          y={count === undefined ? 50 : 45}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={19}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {(clamped * 100).toFixed(0)}%
        </text>
        {count !== undefined ? (
          <text
            x={50}
            y={63}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            {count}
          </text>
        ) : null}
      </svg>

      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-xs font-semibold leading-tight text-foreground">{label}</span>
        {caption ? (
          <span className="text-[10px] leading-tight text-muted-foreground">{caption}</span>
        ) : null}
      </div>
    </>
  );

  const shell = cn('flex flex-col items-center gap-2', className);

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        shell,
        'rounded-card-nested p-1 transition-colors hover:bg-surface-sunken',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {body}
    </button>
  );
}
