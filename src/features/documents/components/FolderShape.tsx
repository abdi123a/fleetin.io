import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/utils';

import type { FolderPaper } from '../drive';

/**
 * One folder, drawn as a folder — and it opens.
 *
 * The drawing is the drive's own: the same two shapes at the same coordinates
 * it has always used (see `FOLDER_TAB`), so a grid of folders at rest is
 * pixel-for-pixel what it was. What is new is that hovering one opens it, and
 * the papers it fans out are the papers it actually holds. The choreography is
 * adapted from React Bits' `Folder` (reactbits.dev); the styles live in
 * `src/styles/folder.css` and that file's header records what changed and why.
 *
 * ## The shape carries the state
 *
 * A clean folder's tab wears the brand. One holding an expired or missing paper
 * is red, one expiring is amber. The colour is the worst finding anywhere in
 * the subtree, so a lapsed policy on truck nineteen is a red folder at the root
 * — which is what lets the tree afford to have levels at all. The body stays
 * neutral so the tab has the grid to itself.
 *
 * ## Open is the host's to say
 *
 * There is no internal toggle. On the drive a click means "go into this
 * folder", so the tile owns the click and lends this component `open` from
 * hover and focus instead. The animation previews the click rather than
 * competing with it, and it works from the keyboard for free.
 */
export type FolderTone = 'clean' | 'warn' | 'fault';

/**
 * The tab, at the coordinates the drive has always drawn it.
 *
 * Tab and face are two shapes rather than one path, because that is what makes
 * it read as a folder rather than as a rounded rectangle with a bite taken out
 * of it: the face overlaps the tab, and the two tones give the fold an edge.
 * The face is an HTML box rather than the `<rect>` it used to be — it has to
 * skew open, and it now has papers to sit in front of — but it is the same
 * rectangle, inset and rounded to the same numbers. See `.fl-folder__well`.
 */
const FOLDER_TAB = 'M2 8a6 6 0 0 1 6-6h14.3a6 6 0 0 1 4.4 1.9l3 3.2A2 2 0 0 0 31.2 8H56a6 6 0 0 1 6 6v6H2Z';

const MAX_PAPERS = 3;

const AT_REST = { x: 0, y: 0 };

/** How far a sheet drifts toward the cursor, as a fraction of the distance. */
const MAGNET_PULL = 0.15;

export function FolderShape({
  tone = 'clean',
  open = false,
  /**
   * The papers inside, most urgent first — at most three.
   *
   * A folder that holds nothing opens onto nothing, which is the truth and
   * saves the badge underneath from having to contradict the picture.
   */
  papers = [],
  /** The folder's width in pixels. Every other dimension follows from it. */
  width,
  /** A company mark for the face — identity, so it holds still while the papers move. */
  mark,
  className,
}: {
  tone?: FolderTone;
  open?: boolean;
  papers?: FolderPaper[];
  width?: number;
  mark?: ReactNode;
  className?: string;
}) {
  const [offsets, setOffsets] = useState(() => Array.from({ length: MAX_PAPERS }, () => AT_REST));

  const sheets = papers.slice(0, MAX_PAPERS);

  const magnetise = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>, index: number) => {
      if (!open) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) * MAGNET_PULL;
      const y = (event.clientY - (rect.top + rect.height / 2)) * MAGNET_PULL;
      setOffsets((previous) => previous.map((offset, i) => (i === index ? { x, y } : offset)));
    },
    [open],
  );

  const release = useCallback((index: number) => {
    setOffsets((previous) => previous.map((offset, i) => (i === index ? AT_REST : offset)));
  }, []);

  return (
    <span
      aria-hidden
      className={cn('fl-folder', `fl-folder--${tone}`, open && 'fl-folder--open', className)}
      /* The fan's poses are struck for three. One sheet sent to a wing of a fan
         that has no other wing just looks dropped, so the count is on the
         element and the stylesheet places a lone sheet in the middle. */
      data-sheets={sheets.length}
      style={width ? ({ '--fl-folder-w': `${width}px` } as CSSProperties) : undefined}
    >
      {/* The tab, and the inside the flaps open onto. */}
      <svg viewBox="0 0 64 50" className="fl-folder__shell">
        <path d={FOLDER_TAB} className="fl-folder__tab" />
      </svg>
      <span className="fl-folder__inside" />

      {/* The well is the face rectangle: everything the folder holds lives
          inside it, and the flaps are cut to it. */}
      <span className="fl-folder__well">
        {sheets.map((paper, index) => (
          <span
            /* By position. A company folder can hold the same paper twice over
               — two drivers of the same name, one licence each — so the pair
               that names a sheet does not name it uniquely. The list is short,
               ordered and re-rendered whole; the index is the stable identity
               here. */
            key={index}
            className="fl-folder__paper"
            data-state={paper.state}
            onMouseMove={(event) => magnetise(event, index)}
            onMouseLeave={() => release(index)}
            style={
              open
                ? ({
                    '--fl-magnet-x': `${(offsets[index] ?? AT_REST).x}px`,
                    '--fl-magnet-y': `${(offsets[index] ?? AT_REST).y}px`,
                  } as CSSProperties)
                : undefined
            }
          >
            {/* Ruled like a page, and titled. At this size the title is all
                that can be read, and it is the only part worth reading — the
                dates are a click away and the state is in the ink. */}
            <span className="fl-folder__paper-title">{paper.category}</span>
            <span className="fl-folder__paper-rule" />
            <span className="fl-folder__paper-rule" />
          </span>
        ))}

        <span className="fl-folder__front" />
        <span className="fl-folder__front fl-folder__front--right" />
        {mark && <span className="fl-folder__mark">{mark}</span>}
      </span>
    </span>
  );
}
