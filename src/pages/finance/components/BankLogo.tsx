import { useRef, type ChangeEvent } from 'react';

import { IconChip } from '@/design-system';
import { Landmark, Trash2, Upload } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * A bank wears its own mark wherever it is named — same rule the shipper and
 * transporter tables follow. No logo on file falls back to the generic
 * `Landmark` chip rather than to initials: two Djiboutian banks share a first
 * letter often enough that initials would identify nothing.
 */
export function BankLogo({
  logoUrl,
  name,
  size = 36,
  className,
}: {
  logoUrl?: string | null;
  name: string;
  size?: 44 | 36;
  className?: string;
}) {
  if (!logoUrl) return <IconChip icon={Landmark} size={size} tint="teal" className={className} />;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-cover" />
    </span>
  );
}

/**
 * The circular picker inside the register/edit sheet. Holds nothing itself —
 * the parent keeps the `File` and only uploads it once the account exists,
 * because the upload endpoint is keyed by account id.
 */
export function BankLogoPicker({
  previewUrl,
  fileName,
  onPick,
  onClear,
  bankName,
}: {
  previewUrl: string | null;
  fileName: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
  bankName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onPick(file);
    // Reset so re-picking the same file still fires a change.
    event.target.value = '';
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-sunken/50 p-3.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-full border border-dashed border-border bg-surface transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={previewUrl ? 'Change bank logo' : 'Upload bank logo'}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={`${bankName || 'Bank'} logo preview`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Landmark aria-hidden className="size-6 text-muted-foreground" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-xs font-bold text-foreground">
          {fileName ?? (previewUrl ? 'Logo on file' : 'No logo yet')}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-surface-sunken"
          >
            <Upload aria-hidden className="size-3.5" />
            {previewUrl ? 'Change' : 'Upload'}
          </button>
          {previewUrl ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
            >
              <Trash2 aria-hidden className="size-3.5" />
              Remove
            </button>
          ) : null}
        </span>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}
