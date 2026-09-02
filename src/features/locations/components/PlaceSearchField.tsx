import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, MapPin, Search, X } from '@/design-system/icons';
import { Input } from '@/design-system';
import { cn } from '@/utils';
import { usePlaceSearch } from '../api/queries';
import { LOCATION_KIND_LABELS, type PlaceCandidate } from '../api/locationsService';

/**
 * Find a real place on Google, instead of typing a name into a box.
 *
 * This is the whole point of the location catalogue: "Doraleh Container
 * Terminal" typed by hand is six characters away from a typo that nothing can
 * detect and nothing can measure to. Picked from here, it arrives with Google's
 * address and Google's coordinates, and a distance to it is a road rather than
 * an estimate.
 *
 * Every keystroke past the floor is a billed Google call, so:
 *   - the term is debounced before the query is allowed to run;
 *   - `usePlaceSearch` refuses anything under three characters;
 *   - results are cached per term, so backspacing and retyping costs nothing.
 *
 * Candidates already in the catalogue are shown and marked rather than hidden —
 * somebody searching for a terminal that is already saved deserves to be told
 * it exists, not handed a list that mysteriously omits the thing they wanted.
 */

/** Long enough that a fast typist makes one call per word, not one per letter. */
const DEBOUNCE_MS = 400;

export interface PlaceSearchFieldProps {
  onPick: (candidate: PlaceCandidate) => void;
  /** False when the server has no Google key — the field says so and stands down. */
  enabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function PlaceSearchField({
  onPick,
  enabled = true,
  placeholder = 'Search Google — a port, a free zone, an address…',
  className,
}: PlaceSearchFieldProps) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const { data: candidates, isFetching, error } = usePlaceSearch(debounced, enabled);

  /* Clicking anywhere else closes the list. Bound on the document because the
     results are a popover over whatever follows the field. */
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const showResults = open && debounced.trim().length >= 3;

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={!enabled}
          placeholder={
            enabled ? placeholder : 'Google Maps is not configured on this server'
          }
          className="pl-9 pr-9"
          /* A form wrapping this must not submit when the operator presses
             Enter to accept a search term. */
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'Escape') setOpen(false);
          }}
        />
        {isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : term ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setTerm('');
              setDebounced('');
              setOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showResults && (
        <div className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-lg">
          {error ? (
            <div className="flex items-start gap-2 px-3 py-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-subtle-foreground" />
              <span>
                {(error as Error).message ||
                  'Google could not be reached. Enter the location by hand below.'}
              </span>
            </div>
          ) : isFetching ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Searching Google…</div>
          ) : !candidates?.length ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Nothing found for “{debounced}”. Try the full name, or add it by hand below.
            </div>
          ) : (
            candidates.map((candidate) => (
              <button
                key={candidate.googlePlaceId}
                type="button"
                onClick={() => {
                  onPick(candidate);
                  setTerm(candidate.name);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {candidate.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {LOCATION_KIND_LABELS[candidate.kind]}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {candidate.formattedAddress}
                  </span>
                </span>
                {candidate.alreadySaved && (
                  <span className="mt-0.5 flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-success-subtle-foreground">
                    <Check className="h-3 w-3" />
                    Saved
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
