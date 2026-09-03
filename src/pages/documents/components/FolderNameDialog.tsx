import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Input,
} from '@/design-system';

/**
 * Name a folder — the whole of making one, and the whole of renaming one.
 *
 * One dialog for both, because they ask the identical question. A folder in
 * the Files section is a name and a place; the place is the folder you are
 * standing in, already chosen by having walked there, so the name is all
 * that is left to ask.
 *
 * The error comes from the server rather than from a rule repeated here. Two
 * folders of one name in one place is the only thing that gets refused, and
 * the refusal already says so in words worth showing — a second copy of that
 * rule in the client would be one more place for it to drift.
 */
export function FolderNameDialog({
  open,
  title,
  confirmLabel,
  initialName = '',
  busy = false,
  error,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  /** The current name, when renaming. */
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  /* Reset on open, not on every render of a live dialog — otherwise typing
     into a rename would be overwritten by the name being renamed. */
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent size="sm">
        <DialogHeader title={title} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
        >
          <DialogBody className="space-y-2">
            <Input
              autoFocus
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contracts"
              aria-label="Folder name"
            />
            {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!trimmed || busy} isLoading={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
