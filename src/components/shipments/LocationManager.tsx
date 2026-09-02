import { useState } from 'react';

import { Check, Pencil, Plus, RotateCcw, Trash2, X } from '@/design-system/icons';
import { Button, Input } from '@/design-system';
import { cn } from '@/utils';

/**
 * Add, rename and remove the places a shipment can start or end.
 *
 * Opened from the location picker and drawn in place, the way the shipping-line
 * manager is: this form is already a modal, and stacking a second one over it
 * takes the half-filled shipment off the screen to do ten seconds of
 * housekeeping.
 *
 * Every row is fully editable, ports included — see `locationCatalog` for why
 * the built-in list is not privileged here. The safety net is Reset rather than
 * a locked row: one click puts the corridor's own list back, and no edit here
 * can reach a shipment that already exists.
 */
export function LocationManager({
  title,
  locations,
  inUse,
  onChange,
  onReset,
  onClose,
  onAdded,
  onRenamed,
}: {
  title: string;
  locations: string[];
  /** What the form currently has selected, so this can follow a rename. */
  inUse?: string;
  onChange: (locations: string[]) => void;
  onReset: () => void;
  onClose: () => void;
  /** Fires with the new name, so the picker can select what was just added. */
  onAdded: (name: string) => void;
  /** Fires when the selected location is renamed under the form's feet. */
  onRenamed: (name: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clashes = (name: string, ignoreIndex?: number) =>
    locations.some(
      (existing, index) =>
        index !== ignoreIndex && existing.toLowerCase() === name.toLowerCase(),
    );

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (clashes(trimmed)) {
      setError(`${trimmed} is already on the list.`);
      return;
    }
    onChange([...locations, trimmed]);
    setDraft('');
    setError(null);
    onAdded(trimmed);
  };

  const commitRename = (index: number) => {
    const trimmed = editingName.trim();
    const previous = locations[index];
    if (!trimmed || trimmed === previous) {
      setEditingIndex(null);
      return;
    }
    if (clashes(trimmed, index)) {
      setError(`${trimmed} is already on the list.`);
      return;
    }
    onChange(locations.map((name, i) => (i === index ? trimmed : name)));
    /* A rename under a selected value would otherwise leave the field holding
       a name the list no longer offers, which reads as the picker emptying
       itself. */
    if (inUse && inUse === previous) onRenamed(trimmed);
    setEditingIndex(null);
    setError(null);
  };

  const removeAt = (index: number) => {
    onChange(locations.filter((_, i) => i !== index));
    if (inUse && inUse === locations[index]) onRenamed('');
    setError(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-foreground">{title}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border-strong bg-card p-2">
        {/* Wrapped, not classed: `Input` puts its `className` on the inner
            <input> and always renders a `w-full` wrapper, so a width passed to
            the component never reaches the box that lays out. */}
        <div className="min-w-[90px] flex-1 basis-0">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              }
            }}
            placeholder="New location…"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={commitDraft}
          disabled={!draft.trim()}
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
        >
          Add
        </Button>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {locations.map((name, index) => {
          const isEditing = editingIndex === index;
          return (
            <li
              key={`${name}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-2 py-1.5"
            >
              {isEditing ? (
                <>
                  <div className="min-w-[90px] flex-1 basis-0">
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitRename(index);
                        }
                        if (event.key === 'Escape') setEditingIndex(null);
                      }}
                    />
                  </div>
                  <IconAction label="Save name" onClick={() => commitRename(index)}>
                    <Check className="w-3.5 h-3.5" />
                  </IconAction>
                  <IconAction label="Cancel" onClick={() => setEditingIndex(null)}>
                    <X className="w-3.5 h-3.5" />
                  </IconAction>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {name}
                  </span>
                  <IconAction
                    label={`Rename ${name}`}
                    onClick={() => {
                      setEditingIndex(index);
                      setEditingName(name);
                      setError(null);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </IconAction>
                  <IconAction label={`Remove ${name}`} danger onClick={() => removeAt(index)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconAction>
                </>
              )}
            </li>
          );
        })}
        {locations.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
            No locations left — add one, or reset the list.
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[10px] text-muted-foreground">
          Saved in this browser. Shipments already created keep the place they were booked to.
        </p>
        <button
          type="button"
          onClick={() => {
            onReset();
            setEditingIndex(null);
            setError(null);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
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
