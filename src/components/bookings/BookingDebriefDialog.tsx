import { Button, Card, IconChip } from '@/design-system';
import { Star } from '@/design-system/icons';
import { useUpdateBooking } from '@/features/bookings/api/queries';
import { cn } from '@/utils';

/** Who a debrief is about. Same three axes, different person answering for. */
export type DebriefSubject = 'driver' | 'shipper';

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
 * A container's round trip has two counterparties and they answer for different
 * halves of it. The carrier owns the road: whether the truck came, whether it
 * came on time, how the load was handled. The shipper owns the yard: how fast
 * the box was stripped and released, which is the half that actually runs the
 * detention clock and which the carrier is otherwise blamed for.
 *
 * So the axes keep their names — `@/lib/rating` averages both kinds on one
 * scale and must not care who was asked — and only the questions change.
 */
export const DEBRIEF_SUBJECTS: Record<
  DebriefSubject,
  { title: string; rung: string; axes: Record<DebriefAxis, { label: string; hint: string }>; placeholder: string }
> = {
  driver: {
    title: 'How did it go?',
    rung: 'Arrived',
    placeholder: 'Anything worth recording about this delivery',
    axes: {
      reliability: { label: 'Reliability', hint: 'Did the job get done as planned?' },
      punctuality: { label: 'Punctuality', hint: 'Was it done on time?' },
      professionalism: { label: 'Professionalism', hint: 'How was it handled and left?' },
    },
  },
  shipper: {
    title: 'How was the shipper?',
    rung: 'Completed',
    placeholder: 'Anything worth recording about this shipper',
    axes: {
      reliability: { label: 'Reliability', hint: 'Was the cargo and paperwork as agreed?' },
      punctuality: { label: 'Punctuality', hint: 'Did they strip and release the box promptly?' },
      professionalism: { label: 'Professionalism', hint: 'How were they to deal with?' },
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
export function debriefSubjectFor(target: string, reached: string): DebriefSubject | null {
  if (target === DEBRIEF_SUBJECTS.driver.rung) return 'driver';
  if (reached === DEBRIEF_SUBJECTS.shipper.rung) return 'shipper';
  return null;
}

export interface BookingDebriefDialogProps {
  draft: DebriefDraft | null;
  bookingId: string;
  driverName?: string | null;
  shipperCompany?: string | null;
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
  shipperCompany,
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
  const who = (debrief.subject === 'shipper' ? shipperCompany : driverName)?.trim();
  return (
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-[2px]"
        onClick={(event) => event.stopPropagation()}
      >
        <Card className="w-full max-w-md space-y-4 rounded-card border border-border bg-card p-5 shadow-lg">
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
                /* Two counterparties, two sets of columns. Written out rather
                   than built from a string prefix so the payload stays typed
                   and a renamed field fails the build instead of the save. */
                const payload =
                  debrief.subject === 'shipper'
                    ? {
                        ...(debrief.reliability > 0 ? { shipperRatingReliability: debrief.reliability } : {}),
                        ...(debrief.punctuality > 0 ? { shipperRatingPunctuality: debrief.punctuality } : {}),
                        ...(debrief.professionalism > 0
                          ? { shipperRatingProfessionalism: debrief.professionalism }
                          : {}),
                        ...(overall !== undefined ? { shipperRating: overall } : {}),
                        ...(note ? { shipperNote: note } : {}),
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
