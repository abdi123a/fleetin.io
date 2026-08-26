import { ConsolePanel, StatBox } from './kit';
import type { Funnel } from './model';
import { djfCard, pct } from './money';

/**
 * Every offer this period, and where it stopped.
 *
 * A funnel earns its place here because the two narrow points have different
 * owners: offers we turned down are a dispatch decision, and delivered work
 * that never turned into cash is an invoicing one. Drawn as trapezoids rather
 * than a stacked bar so the taper itself carries the loss, and the two boxes
 * underneath name the money sitting at each pinch.
 */

const STAGE_COLORS = [
  'var(--fl-teal-800)',
  'var(--fl-teal-700)',
  'var(--fl-teal-600)',
  'var(--fl-teal-400)',
  'var(--accent-bold)',
];

const WIDTH = 320;
const BAND_HEIGHT = 38;
const BAND_GAP = 8;

export interface OfferToPaymentCardProps {
  funnel: Funnel;
  className?: string;
}

export function OfferToPaymentCard({ funnel, className }: OfferToPaymentCardProps) {
  const stages = [
    { key: 'offers', value: funnel.offers, label: 'Offers received' },
    {
      key: 'accepted',
      value: funnel.accepted,
      label: 'Accepted',
      note: `${pct(funnel.acceptanceRate)} acceptance`,
    },
    {
      key: 'delivered',
      value: funnel.delivered,
      label: 'Delivered',
      note: `${pct(funnel.onTimeRate)} on-time`,
    },
    {
      key: 'invoiced',
      value: funnel.invoiced,
      label: 'Invoiced',
      note: funnel.awaitingDocs > 0 ? `${funnel.awaitingDocs} awaiting documents` : undefined,
    },
    {
      key: 'paid',
      value: funnel.paid,
      label: 'Paid',
      note: funnel.unpaid > 0 ? `${funnel.unpaid} unpaid` : undefined,
    },
  ];

  const peak = Math.max(1, ...stages.map((stage) => stage.value));
  const height = stages.length * BAND_HEIGHT + (stages.length - 1) * BAND_GAP;

  /** Half-width of a band, as a share of the widest stage. */
  const halfWidth = (value: number) => (Math.max(value, peak * 0.28) / peak) * (WIDTH / 2);

  return (
    <ConsolePanel
      className={className}
      title="Offer to Payment"
      subtitle={`${funnel.offers} shipper offers this period`}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Offer to payment funnel"
      >
        {stages.map((stage, index) => {
          const top = index * (BAND_HEIGHT + BAND_GAP);
          const topHalf = halfWidth(stage.value);
          const nextStage = stages[index + 1];
          const bottomHalf = halfWidth(nextStage ? nextStage.value : stage.value * 0.94);
          const cx = WIDTH / 2;
          const isLast = index === stages.length - 1;

          return (
            <g key={stage.key}>
              <polygon
                points={[
                  `${cx - topHalf},${top}`,
                  `${cx + topHalf},${top}`,
                  `${cx + bottomHalf},${top + BAND_HEIGHT}`,
                  `${cx - bottomHalf},${top + BAND_HEIGHT}`,
                ].join(' ')}
                fill={STAGE_COLORS[index]}
              />
              <text
                x={cx}
                y={top + (stage.note ? 17 : 23)}
                textAnchor="middle"
                className="text-[11.5px] font-bold"
                fill={isLast ? 'var(--accent-bold-foreground)' : 'var(--fl-neutral-0)'}
              >
                {stage.value} · {stage.label}
              </text>
              {stage.note ? (
                <text
                  x={cx}
                  y={top + 31}
                  textAnchor="middle"
                  className="text-[10px] font-semibold"
                  fill={isLast ? 'var(--accent-bold-foreground)' : 'var(--fl-neutral-0)'}
                  opacity={0.78}
                >
                  {stage.note}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatBox
          label="Lost at offer"
          value={funnel.declined}
          note={`≈${djfCard(funnel.declinedValue)} declined`}
        />
        <StatBox
          label="Lost at payment"
          value={funnel.unpaid}
          note={`${djfCard(funnel.unpaidValue)} unsettled`}
          tone="attention"
        />
      </div>
    </ConsolePanel>
  );
}

export default OfferToPaymentCard;
