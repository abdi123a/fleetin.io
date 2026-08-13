import {
  Download,
  Eye,
  FileCode,
  FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Trash2,
} from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { IconButton } from '@/design-system/primitives/Button';
import { cn } from '@/utils';
import { IconChip } from '../IconChip/IconChip';

/* ===========================================================================
 * Helper: Icon by file type
 * =========================================================================== */

function getFileTypeInfo(type?: string): { icon: ReactNode; color: string; bg: string } {
  const ext = (type ?? '').toLowerCase().replace('.', '');
  if (['pdf'].includes(ext)) {
    return { icon: <FileText className="h-5 w-5" />, color: 'text-destructive', bg: 'bg-destructive-subtle' };
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: <FileSpreadsheet className="h-5 w-5" />, color: 'text-success', bg: 'bg-success-subtle' };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) {
    return { icon: <ImageIcon className="h-5 w-5" />, color: 'text-warning', bg: 'bg-warning-subtle' };
  }
  if (['json', 'ts', 'tsx', 'js', 'html', 'css'].includes(ext)) {
    return { icon: <FileCode className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary-subtle' };
  }
  return { icon: <FileIcon className="h-5 w-5" />, color: 'text-info', bg: 'bg-info-subtle' };
}

/* ===========================================================================
 * FilePreview
 * =========================================================================== */

export interface FilePreviewProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: string;
  type?: string;
  date?: string;
  onDownload?: () => void;
  onRemove?: () => void;
  onView?: () => void;
  disabled?: boolean;
}

export const FilePreview = forwardRef<HTMLDivElement, FilePreviewProps>(function FilePreview(
  { name, size, type, date, onDownload, onRemove, onView, disabled, className, ...props },
  ref,
) {
  const info = getFileTypeInfo(type ?? name.split('.').pop());

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 transition-colors',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', info.bg, info.color)}>
          {info.icon}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="type-body-sm font-medium text-foreground truncate">{name}</p>
          <div className="flex items-center gap-2 type-body-2xs text-muted-foreground">
            {size && <span>{size}</span>}
            {size && date && <span>•</span>}
            {date && <span>{date}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onView && (
          <IconButton variant="ghost" size="sm" onClick={onView} aria-label="View file">
            <Eye className="h-4 w-4" />
          </IconButton>
        )}
        {onDownload && (
          <IconButton variant="ghost" size="sm" onClick={onDownload} aria-label="Download file">
            <Download className="h-4 w-4" />
          </IconButton>
        )}
        {onRemove && (
          <IconButton variant="ghost" size="sm" onClick={onRemove} aria-label="Remove file">
            <Trash2 className="h-4 w-4 text-destructive" />
          </IconButton>
        )}
      </div>
    </div>
  );
});

/* ===========================================================================
 * DocumentPreview
 * =========================================================================== */

export interface DocumentPreviewProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  type?: string;
  size?: string;
  status?: string;
  onDownload?: () => void;
  onView?: () => void;
}

export const DocumentPreview = forwardRef<HTMLDivElement, DocumentPreviewProps>(
  function DocumentPreview({ title, type, size, status, onDownload, onView, className, ...props }, ref) {
    const info = getFileTypeInfo(type ?? title.split('.').pop());

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col justify-between rounded-md border border-border bg-surface p-4 space-y-3 transition hover:border-border-strong',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-md', info.bg, info.color)}>
            {info.icon}
          </div>
          {status && (
            <span className="type-body-2xs uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-sm">
              {status}
            </span>
          )}
        </div>
        <div>
          <p className="type-body-sm text-foreground truncate">{title}</p>
          <p className="type-body-xs text-muted-foreground mt-0.5">
            {type?.toUpperCase() || 'DOCUMENT'} {size && `• ${size}`}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          {onView && (
            <button
              type="button"
              onClick={onView}
              className="flex-1 inline-flex items-center justify-center gap-1.5 type-body-xs font-medium text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="flex-1 inline-flex items-center justify-center gap-1.5 type-body-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          )}
        </div>
      </div>
    );
  },
);

/* ===========================================================================
 * ImagePreview
 * =========================================================================== */

export interface ImagePreviewProps extends HTMLAttributes<HTMLDivElement> {
  src: string;
  alt?: string;
  caption?: string;
  onView?: () => void;
  onRemove?: () => void;
}

export const ImagePreview = forwardRef<HTMLDivElement, ImagePreviewProps>(function ImagePreview(
  { src, alt, caption, onView, onRemove, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('group relative overflow-hidden rounded-md border border-border bg-surface', className)}
      {...props}
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img src={src} alt={alt ?? ''} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      </div>
      {/* Overlay controls */}
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {onView && (
          <IconButton variant="secondary" size="sm" onClick={onView} aria-label="View image">
            <Eye className="h-4 w-4" />
          </IconButton>
        )}
        {onRemove && (
          <IconButton variant="destructive" size="sm" onClick={onRemove} aria-label="Remove image">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      {caption && (
        <div className="p-2.5 border-t border-border">
          <p className="type-body-xs font-medium text-foreground truncate">{caption}</p>
        </div>
      )}
    </div>
  );
});

/* ===========================================================================
 * PDFPreviewPlaceholder
 * =========================================================================== */

export interface PDFPreviewPlaceholderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  onDownload?: () => void;
}

export function PDFPreviewPlaceholder({ title = 'PDF Document', onDownload, className, ...props }: PDFPreviewPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 rounded-md border border-dashed border-border bg-surface-sunken space-y-3',
        className,
      )}
      {...props}
    >
      <IconChip icon={FileText} tint="red" />
      <div className="space-y-1 max-w-xs">
        <p className="type-body-sm text-foreground">{title}</p>
        <p className="type-body-xs text-muted-foreground">Inline PDF preview is disabled in this view.</p>
      </div>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 type-body-xs font-medium text-primary hover:underline pt-1"
        >
          <Download className="h-3.5 w-3.5" /> Download PDF file
        </button>
      )}
    </div>
  );
}
