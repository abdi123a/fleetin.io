import type { ComponentType, SVGProps } from 'react';
import { Ban, Clock, PauseCircle, Truck, Wrench, XCircle } from '@/design-system/icons';
import {
  Badge,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  VerificationBadge,
} from '@/design-system';
import type { ApprovalStatus } from '@/types/shipper';
import type { OperationalStatus, PartnerStatus } from '@/types/partner';
import { cn } from '@/utils';

/**
 * Where a record stands — a shipper, a transporter, a truck or a driver.
 *
 * Four directories, four vocabularies, one grammar. A shipper is *Verified*, a
 * transporter is *Active*, a truck is *Available*; a shipper is *Canceled*, a
 * transporter is *Inactive*, a truck is *Out of Service*. The words stay
 * per-record and everything that *draws* them — the glyph beside the name, the
 * pill, the menu that changes them — is shared, keyed on one tone:
 *
 * - `ok`        working normally — **green**
 * - `waiting`   not yet cleared, or off the road for work on it — **amber**
 * - `busy`      out on the job right now — **blue**
 * - `stopped`   **suspended** / out of service: deliberately halted — **red**
 * - `closed`    the relationship ended — **grey**
 *
 * The tone fixes the colour; an option may bring its own glyph where the
 * tone's default would say the wrong thing (a wrench, not a clock, for a truck
 * in the workshop — both are amber, and only one of them is true).
 *
 * Four states, four colours, and the grey is the point of the set. Suspended is
 * the loud one: somebody stopped this account and somebody has to decide what
 * happens next. A closed account is settled, so it drops back to ink — the same
 * move the container scale makes when a box gets home and stops asking for
 * attention. Painting both of them red, as this first did, made the only
 * distinction that matters invisible.
 *
 * `stopped` is the state that did not exist for shippers until 2026-08-30. Its
 * absence is what forced the choice the user actually complained about: to take
 * a company out of circulation you had to *delete* it, which throws away an
 * account that is only meant to be paused. A pause glyph rather than a cross is
 * the whole point — suspension is reversible, and the mark should say so.
 *
 * Suspension is a record state, not yet an enforcement rule: nothing in the app
 * gates booking on it today (nothing gated on `Canceled` either), so a suspended
 * account still appears in pickers until that is decided separately.
 */

export type RecordStatusTone = 'ok' | 'waiting' | 'busy' | 'stopped' | 'closed';

export interface RecordStatusOption<T extends string = string> {
  value: T;
  label: string;
  tone: RecordStatusTone;
  /**
   * Overrides the tone's glyph where the default would misread.
   *
   * A truck in the workshop and a shipper awaiting approval are both `waiting`
   * amber, but one of them is not waiting for anybody — it is being worked on.
   * Colour is the tone's business; the noun is the option's.
   */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

/** A shipper's four states, in the order the tab bar lists them. */
export const SHIPPER_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<ApprovalStatus>> = [
  { value: 'Verified', label: 'Verified', tone: 'ok' },
  { value: 'Pending', label: 'Pending', tone: 'waiting' },
  { value: 'Suspended', label: 'Suspended', tone: 'stopped' },
  { value: 'Canceled', label: 'Canceled', tone: 'closed' },
];

/** A transporter's four states, same order and the same four tones. */
export const PARTNER_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<PartnerStatus>> = [
  { value: 'Active', label: 'Active', tone: 'ok' },
  { value: 'Pending', label: 'Pending', tone: 'waiting' },
  { value: 'Suspended', label: 'Suspended', tone: 'stopped' },
  { value: 'Inactive', label: 'Inactive', tone: 'closed' },
];

/**
 * The option for a status, always — never `undefined`.
 *
 * Callers were doing `find(...) ?? OPTIONS[1]`, which TypeScript still types as
 * possibly undefined under `noUncheckedIndexedAccess`: indexing an array is not
 * a guarantee. A named fallback makes the total function total.
 */
export function shipperStatusOption(status: ApprovalStatus): RecordStatusOption<ApprovalStatus> {
  return (
    SHIPPER_STATUS_OPTIONS.find((option) => option.value === status) ?? {
      value: status,
      label: status,
      tone: 'waiting',
    }
  );
}

export function partnerStatusOption(status: PartnerStatus): RecordStatusOption<PartnerStatus> {
  return (
    PARTNER_STATUS_OPTIONS.find((option) => option.value === status) ?? {
      value: status,
      label: status,
      tone: 'waiting',
    }
  );
}

/**
 * A vehicle's four operational states.
 *
 * Same colours the row's own `StatusPill` has always used — green, blue, amber,
 * red — so the dot in the list and the ladder in the menu can never disagree.
 * `Out of Service` is `stopped` rather than `closed`: a grounded truck is a
 * problem somebody has to clear, not a settled fact.
 */
export const VEHICLE_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<OperationalStatus>> = [
  { value: 'Available', label: 'Available', tone: 'ok' },
  { value: 'In Transit', label: 'In Transit', tone: 'busy' },
  { value: 'Under Maintenance', label: 'Under Maintenance', tone: 'waiting', icon: Wrench },
  { value: 'Out of Service', label: 'Out of Service', tone: 'stopped', icon: Ban },
];

/**
 * A driver's states — the same enum the vehicle uses, read about a person.
 *
 * `Under Maintenance` is nonsense for a human, so the word changes while the
 * value does not: the backend column is one `OperationalStatus` for both.
 */
export const DRIVER_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<OperationalStatus>> = [
  { value: 'Available', label: 'Available', tone: 'ok' },
  { value: 'In Transit', label: 'On the road', tone: 'busy' },
  { value: 'Under Maintenance', label: 'On leave', tone: 'waiting' },
  { value: 'Out of Service', label: 'Unavailable', tone: 'stopped', icon: Ban },
];

export const shipperStatusTone = (status: ApprovalStatus): RecordStatusTone =>
  SHIPPER_STATUS_OPTIONS.find((option) => option.value === status)?.tone ?? 'waiting';

export const partnerStatusTone = (status: PartnerStatus): RecordStatusTone =>
  PARTNER_STATUS_OPTIONS.find((option) => option.value === status)?.tone ?? 'waiting';

/* ═══════════════════════════════════════════════════════════════════════════
 * The glyph
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The glyph per tone: a filled disc in the tone's colour with the mark cut out
 * of it in the disc's own foreground. Filled, like the verified tick they sit
 * beside — a solid disc and a hollow outline in one column read as two
 * different kinds of mark.
 *
 * `hue` goes on a **wrapper**, not on the `<svg>`, and the svg takes
 * `text-current`. A dropdown item's base style sets `[&_svg]:text-muted-foreground`
 * on every icon inside it, which flattened all four of these to the same grey
 * disc the moment they were put in a menu. Colouring the parent and inheriting
 * is what survives that, given the menu section also lifts the specificity —
 * see `RecordStatusMenuSection`.
 */
const TONE_GLYPH: Record<
  Exclude<RecordStatusTone, 'ok'>,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; hue: string; className: string }
> = {
  waiting: {
    icon: Clock,
    hue: 'text-warning',
    className: '[&>circle]:fill-current [&>path]:stroke-warning-foreground',
  },
  busy: {
    icon: Truck,
    hue: 'text-info',
    className: '',
  },
  /* A pause, not a cross: suspension is reversible and the mark should say so. */
  stopped: {
    icon: PauseCircle,
    hue: 'text-destructive',
    className: '[&>circle]:fill-current [&>line]:stroke-destructive-foreground',
  },
  closed: {
    icon: XCircle,
    hue: 'text-muted-foreground',
    className: '[&>circle]:fill-current [&>path]:stroke-background',
  },
};

/**
 * One glyph for the whole status story, beside the name it is about.
 *
 * Both lists carried their own copy of this — a tick, a clock and a cross — and
 * both replaced a `Status` column that printed the same fact a second time in
 * 12% of the table's width. One component now, so a state added to one party
 * cannot silently go undrawn on the other.
 */
export function RecordStatusMark({
  tone,
  label,
  icon,
  className,
}: {
  tone: RecordStatusTone;
  /** What a screen reader hears — "Pending review", "Suspended". */
  label: string;
  /** The option's own glyph, where the tone's default would misread. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string;
}) {
  if (tone === 'ok' && !icon) return <VerificationBadge state="verified" size="sm" />;
  const fallback = tone === 'ok' ? null : TONE_GLYPH[tone];
  const Icon = icon ?? fallback?.icon;
  if (!Icon) return null;
  const hue = tone === 'ok' ? 'text-success' : fallback?.hue;
  /* An overriding glyph is a plain stroked mark: the fill/stroke pairs below
     are cut for the disc icons and would paint a wrench solid. */
  const markClass = icon ? '' : (fallback?.className ?? '');
  return (
    <span className={cn('inline-flex shrink-0 items-center', hue, className)}>
      <Icon className={cn('size-3.5 text-current', markClass)} aria-label={label} />
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The pill
 * ═══════════════════════════════════════════════════════════════════════ */

const TONE_INTENT: Record<RecordStatusTone, 'success' | 'warning' | 'destructive' | 'info' | 'default'> = {
  ok: 'success',
  waiting: 'warning',
  busy: 'info',
  stopped: 'destructive',
  /* Ink, not red. A closed account is settled — it should stop asking for
     attention, which is exactly what the red it used to wear kept doing. */
  closed: 'default',
};

/**
 * The pill, where a record has room for the word rather than the glyph — a
 * drawer header, a dossier. `ok` returns the app's bare verification tick,
 * which is what every other verified record in the app wears.
 */
export function RecordStatusBadge({
  option,
  className,
}: {
  option: RecordStatusOption;
  className?: string;
}) {
  if (option.tone === 'ok' && !option.icon) return <VerificationBadge state="verified" size="sm" />;
  const Icon = option.icon ?? (option.tone === 'ok' ? null : TONE_GLYPH[option.tone].icon);
  if (!Icon) return null;
  return (
    <Badge
      intent={TONE_INTENT[option.tone]}
      variant="subtle"
      size="sm"
      className={cn('shrink-0 gap-1 px-2 py-0.5 text-[11px] font-medium', className)}
    >
      <Icon className="size-3" aria-hidden />
      <span>{option.label}</span>
    </Badge>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The control
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The status section of a row's ⋮ menu.
 *
 * The **whole ladder, as a radio group** — the same rule the booking status
 * picker follows. Not "suspend" and "restore" as two verbs that appear and
 * disappear: a menu whose items move depending on where the record already is
 * makes the reader find the control before they can use it, and it is how
 * `Pending` ended up with no way out at all. Every state is always listed, the
 * current one is ticked, and choosing it again is a no-op.
 *
 * Permission is the caller's business: an account without the update grant is
 * not shown this section at all, the same way the rest of its menu drops the
 * actions it cannot perform. See either list page.
 */
export function RecordStatusMenuSection<T extends string>({
  label = 'Status',
  value,
  options,
  onSelect,
  busy = false,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<RecordStatusOption<T>>;
  onSelect: (next: T) => void;
  /** A write is in flight — the ladder is read-only until it lands. */
  busy?: boolean;
}) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(next) => {
          if (next !== value) onSelect(next as T);
        }}
      >
        {options.map((option) => (
          <DropdownMenuRadioItem
            key={option.value}
            value={option.value}
            disabled={busy}
            onClick={(event) => event.stopPropagation()}
            /* `[&>span>svg]` beats the menu's own `[&_svg]:text-muted-foreground`
               on specificity, which is what lets each state keep its colour in
               here; the glyph's wrapper carries the hue and the svg inherits. */
            className="cursor-pointer gap-2 text-xs [&>span>svg]:text-current"
          >
            <RecordStatusMark tone={option.tone} label={option.label} icon={option.icon} />
            <span>{option.label}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
