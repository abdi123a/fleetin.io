import { useId, useRef, type ReactNode } from 'react';

import { Button, Input, Select, Switch, Textarea } from '@/design-system';
import { Trash2, Upload } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The controls every settings section is built from.
 *
 * Settings screens go wrong in one specific way: each section grows its own
 * label typography, its own hint placement, its own idea of how wide a number
 * field is, and the page stops reading as one thing. So the sections below
 * compose these and never style a control themselves.
 *
 * Every field is controlled and writes on change — there is no per-field Save.
 * The page owns saving; see `SectionShell`.
 */

/** Label, control, hint. The unit everything else is made of. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Two columns on desktop, one on a phone. The default settings rhythm. */
export function FieldGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div
      className={cn(
        'grid gap-x-5 gap-y-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  mono,
  type = 'text',
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  mono?: boolean;
  type?: 'text' | 'email' | 'url' | 'tel' | 'time';
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(mono && 'font-mono')}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  step = 1,
  suffix,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Input
        id={id}
        type="number"
        value={Number.isFinite(value) ? String(value) : ''}
        min={min}
        max={max}
        step={step}
        suffixText={suffix}
        onChange={(e) => {
          const next = Number(e.target.value);
          // An empty field reads as NaN; keep the last good value rather than
          // writing NaN into a policy constant something divides by.
          if (Number.isFinite(next)) onChange(next);
        }}
        className="font-mono"
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className="sm:col-span-2">
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** A switch on its own row, with the sentence that says what it does. */
export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-muted/15 px-4 py-3 sm:col-span-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

/**
 * A secret.
 *
 * Masked by the browser's own password control, which is the honest amount of
 * protection available here: the value is in `localStorage` either way. The
 * hint on every use of this says so.
 */
export function SecretField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        isPassword
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
    </Field>
  );
}

/** Comma- or newline-separated list, edited as text and stored as an array. */
export function ListField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className="sm:col-span-2">
      <Textarea
        id={id}
        rows={2}
        value={value.join('\n')}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[\n,]/)
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
        className="font-mono text-xs"
      />
    </Field>
  );
}

/** Largest image accepted, in bytes. Anything bigger blows the storage quota. */
const MAX_IMAGE_BYTES = 512 * 1024;

/**
 * An uploaded image, held as a data URL.
 *
 * There is no upload endpoint for branding yet, so the file is read in the
 * browser and stored inline. That is what caps it at half a megabyte:
 * `localStorage` is a handful of megabytes total and a logo is not allowed to
 * be most of it. A PNG with transparency at roughly 600px wide is comfortably
 * under and prints cleanly at letterhead size.
 */
export function ImageField({
  label,
  value,
  onChange,
  hint,
  /** Shown when nothing is uploaded — the file shipped in `/public`. */
  fallbackSrc,
  previewClassName,
  dark,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: ReactNode;
  fallbackSrc?: string;
  previewClassName?: string;
  /** Preview on a dark tile, for assets meant for the sidebar. */
  dark?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = value ?? fallbackSrc ?? null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(
        `That file is ${(file.size / 1024).toFixed(0)} KB. Images are stored in the browser, so the limit is ${MAX_IMAGE_BYTES / 1024} KB — export it smaller and try again.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border p-2',
            dark ? 'bg-primary' : 'bg-muted/25',
            previewClassName,
          )}
        >
          {shown ? (
            <img src={shown} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              None
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              // Clear so re-picking the same file fires `change` again.
              e.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-destructive-subtle-foreground"
              onClick={() => onChange(null)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

/** A colour, editable both as a swatch and as a hex string. */
export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

/**
 * A warning that belongs to the section, not to one field.
 *
 * Used where a setting can do real damage: a bank account nobody verified, an
 * API key sitting in `localStorage`, a commission that changes what partners
 * are paid.
 */
export function SectionNote({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'rounded-card border px-4 py-3 text-xs font-semibold leading-relaxed sm:col-span-2',
        tone === 'warning'
          ? 'border-warning/25 bg-warning-subtle text-warning-subtle-foreground'
          : 'border-border bg-muted/20 text-muted-foreground',
      )}
    >
      {children}
    </p>
  );
}
