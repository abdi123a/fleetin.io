import { Leaf } from '@/design-system/icons';
import { formatFactor, previewVehicleCo2Factor } from '@/lib/co2';
import { cn } from '@/utils';

/**
 * A truck's carbon factor, shown where a field would be — and deliberately not
 * being one.
 *
 * kg CO₂/km is not an opinion: it falls out of what the truck is, what it
 * burns and how old it is. Left as an input it becomes a column of guesses
 * nobody can compare across a fleet, so the form asks the three questions that
 * determine it and prints the answer here, updating as they are answered.
 *
 * The number shown is a **preview** computed by `@/lib/co2`, which mirrors the
 * backend's table; the number stored is always the backend's. The two are held
 * together by a shared fixture list asserted on both sides. Pass `savedPerKm`
 * on an existing truck and that is what is shown instead — a stored factor is
 * the fact, and a preview that disagreed with it would be the more alarming of
 * the two things on screen.
 *
 * The derivation line underneath is the point of the whole component: a reader
 * who can see *why* it is 1.00 never has to ask whether somebody typed it.
 */
export interface Co2FactorFieldProps {
  truckType?: string | null;
  fuelType?: string | null;
  year?: number | null;
  /** The factor already stored on this vehicle. Wins over the preview. */
  savedPerKm?: number | null;
  /** The stored derivation line, when there is one. */
  savedBasis?: string | null;
  className?: string;
}

export function Co2FactorField({
  truckType,
  fuelType,
  year,
  savedPerKm,
  savedBasis,
  className,
}: Co2FactorFieldProps) {
  const preview = previewVehicleCo2Factor({ truckType, fuelType, year });
  const perKm = savedPerKm ?? preview.perKm;
  const basis = savedBasis ?? preview.basis;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-success/25 bg-success-subtle/40 p-3.5',
        className,
      )}
    >
      <Leaf className="size-5 shrink-0 text-success" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          CO₂ Factor
        </span>
        <strong className="block text-sm font-bold tabular-nums text-foreground">
          {formatFactor(perKm)}
        </strong>
        <span className="block truncate text-[10px] font-medium text-muted-foreground">{basis}</span>
      </div>
    </div>
  );
}
