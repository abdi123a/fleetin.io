import { IconChip } from '@/design-system';
import { FileText, Upload, X } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The files behind a proof — several of them, on purpose.
 *
 * A proof of delivery is almost never one page. It is the signed note, and the
 * gate pass, and two photographs of the seal taken on a phone at the
 * consignee's yard. The first cut of this took one file and quietly dropped the
 * rest, which meant the operator chose which piece of the evidence to keep.
 *
 * Photographs and PDFs both, because both are what actually arrives: the
 * office scans, the driver photographs.
 *
 * Each file becomes its own document row under the same category, so a reader
 * opens them one at a time and the backend's guard — which counts rows — is
 * satisfied by any of them.
 */
export function ProofFileField({
  files,
  onChange,
  disabled = false,
  label = 'Add the signed paperwork or a photograph',
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className={cn(
          'flex items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors',
          disabled
            ? 'cursor-not-allowed border-border/60 bg-muted/30'
            : files.length > 0
              ? 'cursor-pointer border-success/50 bg-success-subtle/40'
              : 'cursor-pointer border-primary/40 bg-primary/5 hover:bg-primary/10',
        )}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []);
            if (chosen.length === 0) return;
            /* Appended, not replaced. Somebody photographing four pages picks
               them in two goes as often as one, and the second pick throwing
               away the first is the kind of loss nobody notices until the
               document is needed. Same name and size twice is the same page. */
            const merged = [...files];
            for (const file of chosen) {
              if (!merged.some((held) => held.name === file.name && held.size === file.size)) {
                merged.push(file);
              }
            }
            onChange(merged);
            event.target.value = '';
          }}
        />
        <IconChip icon={files.length > 0 ? FileText : Upload} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold text-foreground">
            {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} attached` : label}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Photographs or PDF · add as many as you have
          </span>
        </span>
      </label>

      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.size}-${index}`}
          className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{file.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
            className="-m-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
