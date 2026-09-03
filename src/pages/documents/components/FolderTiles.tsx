import { useEffect, useState, type ReactNode, type RefObject } from 'react';

import { Badge } from '@/design-system';
import { Building2, Folder, Truck, User } from '@/design-system/icons';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import type { ComplianceTally } from '@/features/documents/compliance';
import { FolderShape, type FolderTone } from '@/features/documents/components/FolderShape';
import type { FolderPaper } from '@/features/documents/drive';

/**
 * A folder on the drive, drawn as a folder — shared by both halves of it.
 *
 * The compliance tree and the Files section list different things (a truck's
 * papers; whatever somebody filed) but they are browsed the same way, and a
 * reader switching between the two tabs should not have to learn a second
 * kind of tile. What differs is carried in: the tone of the tab, and what the
 * bottom band says.
 */
export interface FolderItem {
  key: string;
  label: string;
  sublabel?: string;
  icon: 'company' | 'folder' | 'vehicle' | 'driver';
  company?: { id: string; name: string };
  /** The colour of the tab — the worst thing inside, or nothing. */
  tone: FolderTone;
  /** What the folder fans out when it opens — see `FolderShape`. */
  papers: FolderPaper[];
  /** The bottom band: what is wrong inside, or how much is inside. */
  state?: ReactNode;
  onOpen: () => void;
}

const FOLDER_GLYPH = {
  company: Building2,
  folder: Folder,
  vehicle: Truck,
  driver: User,
} as const;

/**
 * The tile track, as the grid actually lays it out.
 *
 * `auto-fill` means the column count is a function of the width, not of a
 * breakpoint — it is 2 on a phone and 7 on a wide monitor with the sidebar
 * shut. Anything that wants to page this grid has to know the real number, or
 * it hands back a page that cannot fill its own last row.
 */
const FOLDER_MIN_PX = 210;
const FOLDER_GAP_PX = 8; // `gap-2`

/**
 * How many folders fit across, measured from the element that holds them.
 *
 * The same arithmetic `repeat(auto-fill, minmax(210px, 1fr))` does, and the
 * constants above are the ones the grid is declared with, so the two cannot
 * drift.
 */
export function useFolderColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      if (!width) return;
      setColumns(
        Math.max(1, Math.floor((width + FOLDER_GAP_PX) / (FOLDER_MIN_PX + FOLDER_GAP_PX))),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

export function FolderGrid({ items, empty }: { items: FolderItem[]; empty: ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
        {empty}
      </div>
    );
  }

  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr))]">
      {items.map((item) => (
        <FolderTile key={item.key} item={item} />
      ))}
    </div>
  );
}

/**
 * One folder, drawn as a folder.
 *
 * The first cut was a row: a small round mark, a name, a badge on the right. It
 * listed things correctly and read as a table — which is what this page used to
 * be, and the reason it was hard to browse. A folder is a shape people have
 * known for forty years: drawn at size it says "this opens" before a word is
 * read, and a grid of them stops looking like rows of records.
 *
 * ## The shape carries the state
 *
 * A clean folder is quiet grey. One holding an expired or missing paper is red,
 * one expiring is amber. The colour is the worst finding anywhere in the
 * subtree, so a lapsed policy on truck nineteen is a red folder at the root —
 * which is what lets the tree afford to have levels at all.
 */
export function FolderTile({ item }: { item: FolderItem }) {
  const Glyph = FOLDER_GLYPH[item.icon];

  /* Hover and focus, not click — the click is already spoken for. Keyboard
     users get the same preview as pointer users because both land on the same
     button. */
  const [peeking, setPeeking] = useState(false);

  return (
    <button
      type="button"
      onClick={item.onOpen}
      onPointerEnter={() => setPeeking(true)}
      onPointerLeave={() => setPeeking(false)}
      onFocus={() => setPeeking(true)}
      onBlur={() => setPeeking(false)}
      title={item.sublabel ? `${item.label} — ${item.sublabel}` : item.label}
      className="group flex flex-col items-center rounded-lg border border-transparent p-3 text-center transition-colors hover:border-border/80 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {/* Every tile is the same four bands at the same heights — folder, name,
          detail, state — so a grid of them lines up on all four however long
          the names are and whether or not a folder has anything wrong in it.
          The folder reserves the room its papers need, so a tile opening never
          nudges the row it is in. */}
      <span className="flex w-[124px] shrink-0 justify-center">
        <FolderShape
          tone={item.tone}
          open={peeking}
          /* The papers it actually holds, most urgent first. A folder holding
             nothing opens onto nothing, rather than on to three blank sheets
             the badge underneath would then have to contradict. */
          papers={item.papers}
          /* The mark sits on the folder's face, which is what makes a company's
             folder recognisable before it is read. It needs a body colour with
             enough weight to hold it — see `--folder-face`. */
          mark={
            item.company ? (
              <CompanyMark
                id={item.company.id}
                name={item.company.name}
                size="sm"
                className="size-10 ring-2 ring-card"
              />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-full bg-card text-primary-bold ring-2 ring-card">
                <Glyph className="size-5" />
              </span>
            )
          }
        />
      </span>

      <span className="mt-3 block w-full truncate text-sm font-bold leading-tight text-foreground">
        {item.label}
      </span>

      <span className="mt-0.5 block h-4 w-full truncate text-[11px] leading-4 text-muted-foreground">
        {item.sublabel}
      </span>

      <span className="mt-1.5 flex min-h-[20px] flex-wrap items-center justify-center gap-1">
        {item.state}
      </span>
    </button>
  );
}

/** The colour of a compliance folder's tab: the worst finding anywhere inside. */
export function toneOf(tally: ComplianceTally): FolderTone {
  if (tally.expired > 0 || tally.missing > 0) return 'fault';
  if (tally.expiring > 0) return 'warn';
  return 'clean';
}

/**
 * What is wrong inside this folder, without opening it.
 *
 * The whole cost of a tree is that a fault three levels down is invisible from
 * the top, so every folder reports its own subtree. Quiet when the folder is
 * clean — a green tick on every row is a row of ticks nobody reads, and the
 * point of the mark is that it is rare.
 */
export function FolderState({ tally }: { tally: ComplianceTally }) {
  if (tally.required === 0) {
    return <span className="text-[11px] text-muted-foreground">empty</span>;
  }
  if (tally.attention === 0) {
    return (
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {tally.valid}/{tally.required}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-center gap-1">
      {tally.expired > 0 && (
        <Badge intent="destructive" size="sm">
          {tally.expired} expired
        </Badge>
      )}
      {tally.missing > 0 && (
        <Badge intent="destructive" variant="subtle" size="sm">
          {tally.missing} missing
        </Badge>
      )}
      {tally.expiring > 0 && (
        <Badge intent="warning" size="sm">
          {tally.expiring} expiring
        </Badge>
      )}
    </span>
  );
}
