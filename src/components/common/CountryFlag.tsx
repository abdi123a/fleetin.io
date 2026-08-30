import { countryCode } from '@/lib/countryFlag';
import { cn } from '@/utils';

/**
 * A country's flag, as artwork.
 *
 * This replaced a flag **emoji** (`🇩🇯`), which was the wrong tool three ways
 * over. It is drawn by the operating system, so the same row looked different
 * on every machine — and on Windows there are no flag glyphs at all, so it
 * rendered as the bare letters `DJ`. It sits on the text baseline like a
 * character rather than lining up with the row's other marks. And it is the
 * only piece of the interface not drawn in the same flat-SVG language as every
 * icon and company mark around it.
 *
 * The artwork is `flag-icons` (MIT, lipis) — the 4:3 set only. Resolved
 * through Vite's glob rather than the package's stylesheet: that stylesheet
 * names both the 4:3 and the 1:1 sets, which emits 542 files and 5.3MB of
 * build output for a mark that is sixteen pixels wide, and it draws the flag
 * as a CSS `background-image`, which cannot carry alternative text.
 *
 * `eager` is deliberate. The map is 271 short strings — a few kilobytes in the
 * bundle — and it means picking a flag is a plain object lookup instead of 271
 * dynamic-import chunks. The images themselves are still fetched one at a
 * time, only when a row actually shows one.
 */
const FLAG_URLS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** `/node_modules/…/4x3/dj.svg` → `dj`. */
const urlByCode = new Map(
  Object.entries(FLAG_URLS).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
    url,
  ]),
);

export interface CountryFlagProps {
  /** The country's English name, as records store it (e.g. `"Djibouti"`). */
  country: string | null | undefined;
  className?: string;
}

/**
 * Renders nothing for a name that is not a country — a *wrong* flag beside a
 * company is a factual error about where it is, so there is no guess and no
 * placeholder globe. Callers print the name instead.
 */
export function CountryFlag({ country, className }: CountryFlagProps) {
  const code = countryCode(country);
  if (!code) return null;

  const src = urlByCode.get(code.toLowerCase());
  const label = country ?? code;

  /* A real ISO code, but no artwork on file for it — the set covers the
     assigned space, so this is close to unreachable. The code still identifies
     the country correctly, which a missing image does not. */
  if (!src) {
    return (
      <span
        title={label}
        className={cn(
          'inline-block rounded-[2px] border border-border px-1 align-[1px]',
          'font-mono text-[9px] font-bold leading-[1.4] text-muted-foreground',
          className,
        )}
      >
        {code}
      </span>
    );
  }

  return (
    <img
      src={src}
      /* The name is on `title` for a reader who hovers, and empty here on
         purpose: this mark always sits beside the company it belongs to, so
         announcing "Djibouti" would interrupt the name it is decorating. It is
         the flag's job to be quiet. */
      alt=""
      title={label}
      loading="lazy"
      className={cn(
        /* 16×12 — the 4:3 the artwork is drawn at, so nothing is squashed.
           `align-[-1px]` drops it off the baseline onto the x-height, where a
           rectangle sits level with lowercase text instead of riding above it. */
        'inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover align-[-1px]',
        /* A hairline, because a flag with a white field — Japan, Finland — has
           no edge of its own and dissolves into the row without one.
           `ring-inset`, since the frame clips at the rounded corners. */
        'ring-1 ring-inset ring-black/15',
        className,
      )}
    />
  );
}
