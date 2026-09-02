import { useRef } from 'react';

import { Camera, Truck, X } from '@/design-system/icons';
import { Button } from '@/design-system';
import { cn } from '@/utils';

/**
 * The truck's photograph — picked here, uploaded by whoever owns the form.
 *
 * A fleet list of forty plate numbers is forty strings; a fleet list with
 * photographs is a yard somebody recognises. This is the picker: it shows what
 * is chosen (a local preview before the truck exists, the stored image after),
 * and hands the file back.
 *
 * It uploads nothing itself, on purpose. A vehicle has no id until it is
 * registered, so on the create form the file is held and posted after; on the
 * edit form it goes straight to `POST /vehicles/:id/photo`. One component,
 * both flows, and neither of them has to know about the other.
 */
export interface VehiclePhotoFieldProps {
  /** The stored photo, on a truck that already exists. */
  url?: string | null;
  /** A file chosen but not yet uploaded — previewed from memory. */
  pending?: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}

export function VehiclePhotoField({
  url,
  pending,
  onSelect,
  disabled,
  className,
}: VehiclePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /* `createObjectURL` rather than a FileReader: it is synchronous, so the
     preview appears in the same frame as the choice instead of a beat later. */
  const preview = pending ? URL.createObjectURL(pending) : (url ?? null);

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-[11px] font-bold text-foreground">Vehicle Photo</label>

      <div className="flex items-center gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Truck className="size-7 text-muted-foreground" aria-hidden />
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            leadingIcon={<Camera className="size-3.5" />}
            className="h-8 rounded-lg text-xs font-semibold"
          >
            {preview ? 'Replace photo' : 'Add photo'}
          </Button>

          {pending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelect(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              leadingIcon={<X className="size-3.5" />}
              className="h-7 rounded-lg text-xs text-muted-foreground"
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
