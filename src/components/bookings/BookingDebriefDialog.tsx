import { Button, Card, IconChip } from '@/design-system';
import { Star } from '@/design-system/icons';
import { useUpdateBooking } from '@/features/bookings/api/queries';
import { cn } from '@/utils';

/** Who a debrief is about. Same three axes, a different trip each time. */
export type DebriefSubject = 'driver' | 'returnDriver';

export interface DebriefDraft {
  subject: DebriefSubject;
  reliability: number;
  punctuality: number;
  professionalism: number;
  note: string;
}

type DebriefAxis = 'reliability' | 'punctuality' | 'professionalism';
const DEBRIEF_AXES: readonly DebriefAxis[] = ['reliability', 'punctuality', 'professionalism'];

/**
 * The two debriefs, and why there are two.
 *
 * A container's round trip is driven twice: the driver who brought the load,
 * and the driver who came back for the empty, who is frequently not the same
 * person and until now inherited the first one's stars.
 *
 * Only drivers are rated. The shipper used to be a third question here — how
 * fast the box was stripped and released — and it was dropped on 2026-09-01:
 * stars are a measure of how somebody drove, and a shipper does not drive. The
 * detention clock that question was reaching for is already recorded as
 * timestamps on the return leg, where it is a fact rather than an opinion.
 *
 * The axes keep their names — `@/lib/rating` averages both legs on one scale
 * and must not care which trip was asked about — and only the questions change.
 */
export const DEBRIEF_SUBJECTS: Record<
  DebriefSubject,
  {
    title: string;
    /** Which part of the round trip this asks about — shown only when more
        than one question is queued, where "how did it go?" twice in a row is
        otherwise indistinguishable from the first answer not having saved. */
    leg: string;
    rung: string;
    axes: Record<DebriefAxis, { label: string; hint: string }>;
    placeholder: string;
  }
> = {
  driver: {
    title: 'How did it go?',
    leg: 'Delivery',
    /* Asked when the box is HOME, not when the load arrived. A container's job
       is not over at delivery — the same carrier still owes the empty leg — and
       asking at `Arrived` meant the operator was interrupted twice for one
       booking, days apart, for two halves of the same carrier's work. Both
       drivers are now debriefed in one sitting at the end. */
    rung: 'Completed',
    placeholder: 'Anything worth recording about this delivery',
    axes: {
      reliability: { label: 'Reliability', hint: 'Did the job get done as planned?' },
      punctuality: { label: 'Punctuality', hint: 'Was it done on time?' },
      professionalism: { label: 'Professionalism', hint: 'How was it handled and left?' },
    },
  },
  /* The return leg, asked when the box is home. Same axes, and deliberately the
     same words as the delivery driver's — it is the same question about the
     same kind of job, and rewording it would make two answers about one carrier
     incomparable. Only the placeholder names which trip is being rated. */
  returnDriver: {
    title: 'How was the empty return?',
    leg: 'Empty return',
    rung: 'Completed',
    placeholder: 'Anything worth recording about the empty return',
    axes: {
      reliability: { label: 'Reliability', hint: 'Did the job get done as planned?' },
      punctuality: { label: 'Punctuality', hint: 'Was the box fetched on time?' },
      professionalism: { label: 'Professionalism', hint: 'How was it handled and left?' },
    },
  },
};

/** An empty draft for whichever counterparty the rung just reached is about. */
export const emptyDebrief = (subject: DebriefSubject): DebriefDraft => ({
  subject,
  reliability: 0,
  punctuality: 0,
  professionalism: 0,
  note: '',
});

/** Nothing to save until at least one axis is marked or a note is written. */
const debriefHasAnswer = (draft: DebriefDraft) =>
  DEBRIEF_AXES.some((axis) => draft[axis] > 0) || draft.note.trim().length > 0;

/**
 * Which debrief a finished status walk owes, if any.
 *
 * `target` is what was clicked and `reached` is what was actually written — a
 * close walks several rungs at once, and the shipper is asked at the moment the
 * box is genuinely home however many rungs it took to get there. Shared by both
 * status controls so the two cannot drift into asking on different rungs.
 */
/**
 * Who to ask about, in the order they are asked, once the box is home.
 *
 * Everything is asked at the END, on `Completed`, and nothing before it. The
 * delivery driver used to be debriefed at `Arrived`, which split one booking's
 * verdicts across two days and two interruptions — and asked about the delivery
 * while the return that the same carrier still owed had not happened yet. At
 * the close, the whole round trip is known and both answers are given in one
 * sitting: the driver who brought it, and the driver who fetched it.
 *
 * `separateReturnDriver` is the caller's read of whether a second person is
 * even involved: when the same driver ran both legs there is one person and one
 * answer, and it belongs on the delivery columns where the rest of that
 * driver's trips already are.
 */
export function debriefSubjectsFor(
  reached: string,
  options: { separateReturnDriver?: boolean } = {},
): DebriefSubject[] {
  if (reached !== DEBRIEF_SUBJECTS.driver.rung) return [];
  return options.separateReturnDriver ? ['driver', 'returnDriver'] : ['driver'];
}

export interface BookingDebriefDialogProps {
  draft: DebriefDraft | null;
  bookingId: string;
  driverName?: string | null;
  /** Who fetched the empty, when that was somebody else. */
  returnDriverName?: string | null;
  /** Which question this is, and how many the closing owes in all. */
  step?: number;
  total?: number;
  onChange: (draft: DebriefDraft) => void;
  onClose: () => void;
}

/**
 * The debrief, asked wherever a booking's status is moved.
 *
 * It lives here rather than inside one status control because there are two —
 * the picker on a shipment's cards and the Booking Preview's own select — and a
 * dialog that only one of them knows about is a rating that silently depends on
 * which screen the operator happened to use.
 */
export function BookingDebriefDialog({
  draft,
  bookingId,
  driverName,
  returnDriverName,
  step,
  total,
  onChange,
  onClose,
}: BookingDebriefDialogProps) {
  const updateBooking = useUpdateBooking();
  if (!draft) return null;
  const debrief = draft;
  const subject = DEBRIEF_SUBJECTS[debrief.subject];
  /* The counterparty being rated. Named, they take the headline and the
     question drops to an eyebrow: an operator awarding stars has to see whose
     record they land on at a glance, and that was previously an 11px grey
     sentence under the title. Unnamed, the question takes the headline back
     rather than a placeholder standing in for a person. */
  const who = (
    debrief.subject === 'returnDriver' ? returnDriverName : driverName
  )?.trim();
  return (
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-[2px]"
        onClick={(event) => event.stopPropagation()}
      >
        <Card className="w-full max-w-md space-y-4 rounded-card border border-border bg-card p-5 shadow-lg">
          {/* ── WHICH ONE OF THESE AM I ON ──
              A closing that owes two drivers asks twice, back to back, with the
              same three axes and the same layout. Without this the second
              dialog reads as the first one having thrown the answer away rather
              than as a different person's trip, and the honest reaction is to
              re-enter what was just typed. The leg names it; the pips say how
              much of the closing is left. */}
          {total && total > 1 ? (
            <div className="-mt-1 flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                {subject.leg}
              </p>
              <div
                className="flex shrink-0 items-center gap-1"
                role="img"
                aria-label={`Question ${step ?? 1} of ${total}`}
              >
                {Array.from({ length: total }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      index === (step ?? 1) - 1
                        ? 'w-4 bg-warning'
                        : index < (step ?? 1) - 1
                          ? 'w-1.5 bg-warning/50'
                          : 'w-1.5 bg-border',
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            {/* Amber, because it is the same mark the operator is about to
                award. A teal chip sitting over three rows of gold stars reads
                as a different subject than the one being rated. */}
            <IconChip icon={Star} tint="amber" size={44} />
            <div className="min-w-0">
              {who ? (
                <>
                  <p className="text-xs font-semibold text-muted-foreground">{subject.title}</p>
                  <p className="truncate text-lg font-bold leading-tight text-foreground">{who}</p>
                </>
              ) : (
                <p className="text-lg font-bold leading-tight text-foreground">{subject.title}</p>
              )}
            </div>
          </div>

          {/* One rule between axes. Three label/hint/star rows stacked with
              nothing between them read as one paragraph with stars in it. */}
          <div className="divide-y divide-border-subtle">
            {DEBRIEF_AXES.map((axis) => (
              <div key={axis} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-foreground">
                    {subject.axes[axis].label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {subject.axes[axis].hint}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      aria-label={`${subject.axes[axis].label}: ${star} star${star === 1 ? '' : 's'}`}
                      aria-pressed={debrief[axis] === star}
                      onClick={() =>
                        onChange({
                          ...debrief,
                          /* Clicking the star already selected clears the axis
                             — an axis this delivery cannot answer must stay
                             unanswered rather than be forced to a number. */
                          [axis]: debrief[axis] === star ? 0 : star,
                        })
                      }
                      className="group cursor-pointer rounded p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <Star
                        className={cn(
                          'size-5 transition-colors',
                          star <= debrief[axis]
                            ? 'fill-warning text-warning'
                            : 'text-border-strong group-hover:text-warning',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Note</p>
            <textarea
              value={debrief.note}
              onChange={(event) => onChange({ ...debrief, note: event.target.value })}
              rows={3}
              maxLength={2000}
              placeholder={subject.placeholder}
              className="mt-1.5 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="md"
              disabled={updateBooking.isPending}
              onClick={() => onClose()}
            >
              Skip
            </Button>
            <Button
              type="button"
              className="flex-1"
              size="md"
              disabled={updateBooking.isPending || !debriefHasAnswer(debrief)}
              onClick={() => {
                const scored = DEBRIEF_AXES.map((axis) => debrief[axis]).filter((n) => n > 0);
                /* The overall is the mean of the axes actually answered — the
                   same "mean of what could be measured, no weighting" rule
                   `@/lib/rating` uses for the computed star, so the two
                   overalls mean the same thing. */
                const overall =
                  scored.length > 0
                    ? Math.round(scored.reduce((total, n) => total + n, 0) / scored.length)
                    : undefined;
                const note = debrief.note.trim() || undefined;
                /* Two legs, two sets of columns. Written out rather than built
                   from a string prefix so the payload stays typed and a renamed
                   field fails the build instead of the save. */
                const payload =
                  debrief.subject === 'returnDriver'
                    ? {
                        ...(debrief.reliability > 0
                          ? { returnDriverRatingReliability: debrief.reliability }
                          : {}),
                        ...(debrief.punctuality > 0
                          ? { returnDriverRatingPunctuality: debrief.punctuality }
                          : {}),
                        ...(debrief.professionalism > 0
                          ? { returnDriverRatingProfessionalism: debrief.professionalism }
                          : {}),
                        ...(overall !== undefined ? { returnDriverRating: overall } : {}),
                        ...(note ? { returnDriverNote: note } : {}),
                      }
                    : {
                        ...(debrief.reliability > 0 ? { driverRatingReliability: debrief.reliability } : {}),
                        ...(debrief.punctuality > 0 ? { driverRatingPunctuality: debrief.punctuality } : {}),
                        ...(debrief.professionalism > 0
                          ? { driverRatingProfessionalism: debrief.professionalism }
                          : {}),
                        ...(overall !== undefined ? { driverRating: overall } : {}),
                        ...(note ? { driverNote: note } : {}),
                      };
                updateBooking.mutate(
                  { id: bookingId, payload },
                  { onSettled: () => onClose() },
                );
              }}
            >
              {updateBooking.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      </div>
  );
}
