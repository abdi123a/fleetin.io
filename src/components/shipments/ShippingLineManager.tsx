import { useRef, useState } from 'react';

import { Check, Pencil, Plus, Trash2, Upload, X } from '@/design-system/icons';
import { Avatar, Button, Input } from '@/design-system';
import {
  readLogoFile,
  useShippingLineStore,
  type ShippingLine,
} from '@/features/shipping-lines/shippingLines';
import { cn } from '@/utils';

/**
 * Add, re-mark and rename the carriers a shipment can be booked under.
 *
 * Opened from the Shipping Line picker, in place rather than in a second modal:
 * the shipment form is already a modal, and stacking one on top of it takes the
 * half-filled form off the screen to do thirty seconds of housekeeping.
 *
 * The seven seed carriers can be renamed and given a logo but not deleted — an
 * account that has already booked fifty shipments under "Maersk Line" should
 * not be able to make that name disappear from its own history with one click.
 * Lines the account adds itself are fully theirs, deletion included.
 */
export function ShippingLineManager({
  lines,
  onClose,
  onAdded,
}: {
  lines: ShippingLine[];
  onClose: () => void;
  /** Fires with the new line's name, so the picker can select what was just added. */
  onAdded: (name: string) => void;
}) {
  const add = useShippingLineStore((state) => state.add);
  const update = useShippingLineStore((state) => state.update);
  const remove = useShippingLineStore((state) => state.remove);

  const [draftName, setDraftName] = useState('');
  const [draftLogo, setDraftLogo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const draftFileRef = useRef<HTMLInputElement>(null);

  const pickLogo = async (file: File | undefined, apply: (dataUrl: string) => void) => {
    if (!file) return;
    setError(null);
    try {
      apply(await readLogoFile(file));
    } catch {
      setError(`${file.name} could not be read as an image — try a PNG, SVG or JPG.`);
    }
  };

  const commitDraft = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const created = add(trimmed, draftLogo);
    setDraftName('');
    setDraftLogo(null);
    setError(null);
    if (created) onAdded(created.name);
  };

  const commitRename = (line: ShippingLine) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== line.name) update(line.id, { name: trimmed });
    setEditingId(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-foreground">Shipping lines</p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      {/* Add a carrier. Its mark is optional — a name with initials is still a
          usable option, and demanding a logo up front would stop somebody
          finishing the shipment they came here to book. */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border-strong bg-card p-2">
        <LogoWell
          src={draftLogo}
          name={draftName || 'New line'}
          onPick={() => draftFileRef.current?.click()}
          onClear={draftLogo ? () => setDraftLogo(null) : undefined}
        />
        <input
          ref={draftFileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            void pickLogo(e.target.files?.[0], setDraftLogo);
            e.target.value = '';
          }}
        />
        {/* Wrapped, not classed: `Input` puts its `className` on the inner
            <input> and always renders a `w-full` wrapper around it, so sizing
            classes passed to the component never reached the box that lays
            out — the field claimed the whole row and pushed Add to a third
            line inside the shipment modal's ~280px column. */}
        <div className="min-w-[90px] flex-1 basis-0">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
            placeholder="New line, e.g. Evergreen Marine"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={commitDraft}
          disabled={!draftName.trim()}
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Add
        </Button>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {lines.map((line) => {
          const isEditing = editingId === line.id;
          return (
            <li
              key={line.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
            >
              <LogoWell
                src={line.logoUrl}
                name={line.name}
                onPick={() => document.getElementById(`ship-line-logo-${line.id}`)?.click()}
                onClear={line.logoUrl ? () => update(line.id, { logoUrl: null }) : undefined}
              />
              <input
                id={`ship-line-logo-${line.id}`}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  void pickLogo(e.target.files?.[0], (url) => update(line.id, { logoUrl: url }));
                  e.target.value = '';
                }}
              />

              {isEditing ? (
                <>
                  <div className="min-w-[90px] flex-1 basis-0">
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(line);
                        }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  </div>
                  <IconAction label="Save name" onClick={() => commitRename(line)}>
                    <Check className="w-3.5 h-3.5" />
                  </IconAction>
                  <IconAction label="Cancel" onClick={() => setEditingId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </IconAction>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {line.name}
                  </span>
                  {!line.removable && (
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">
                      Built in
                    </span>
                  )}
                  <IconAction
                    label={`Rename ${line.name}`}
                    onClick={() => {
                      setEditingId(line.id);
                      setEditingName(line.name);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </IconAction>
                  {line.removable && (
                    <IconAction
                      label={`Remove ${line.name}`}
                      danger
                      onClick={() => remove(line.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconAction>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground">
        Lines and logos are saved in this browser and offered on every later shipment.
      </p>
    </div>
  );
}

/** The mark, and the two things you can do to it. */
function LogoWell({
  src,
  name,
  onPick,
  onClear,
}: {
  src: string | null;
  name: string;
  onPick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onPick}
        aria-label={src ? `Replace the ${name} logo` : `Upload a logo for ${name}`}
        className="group grid size-9 place-items-center overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-primary"
      >
        {src ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain p-0.5" />
        ) : (
          <>
            <Avatar name={name} size="xs" shape="circle" className="group-hover:opacity-0" />
            <Upload className="absolute h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
          </>
        )}
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove the ${name} logo`}
          className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 rounded-md p-1 text-muted-foreground transition-colors',
        danger ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
