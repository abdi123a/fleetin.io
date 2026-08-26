import { useCallback, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle } from '@/design-system/icons';
import { cn } from '@/utils';
import { Button } from '../Button/Button';
import { IconChip } from '../Display/IconChip/IconChip';

/**
 * The app's "are you sure?".
 *
 * Destructive actions used to fire on the click that requested them — a
 * document, a partner, a price rate all vanished with no way back and nothing
 * asked. A deletion is the one interaction where the cost of a mis-click is not
 * a correction but a loss, so it gets a beat.
 *
 * Built on the dialog primitive already in the project rather than pulling in
 * `@radix-ui/react-alert-dialog` for one component. `useConfirm` below is the
 * way to use it: a call site awaits a boolean and stays readable.
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The destructive button's wording — say the verb, not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive by default; pass false for a merely-consequential confirm. */
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-drawer bg-black/60 backdrop-blur-xs data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-drawer w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
            'rounded-card border border-border bg-card p-5 shadow-2xl',
            'data-[state=open]:animate-fade-in',
          )}
        >
          <div className="flex items-start gap-3">
            <IconChip icon={AlertTriangle} tint={destructive ? 'red' : 'amber'} size={36} />
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="text-sm font-bold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-xs leading-relaxed text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={destructive ? 'destructive' : 'primary'}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type ConfirmRequest = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'>;

/**
 * `const { confirm, confirmDialog } = useConfirm()` — call `await confirm({…})`
 * where the action happens, and render `{confirmDialog}` once in the tree.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmRequest) => {
    setRequest(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  const confirmDialog = request ? (
    <ConfirmDialog
      {...request}
      open
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
