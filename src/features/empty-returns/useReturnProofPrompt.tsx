import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/design-system';
import { ProofFileField } from '@/features/documents/components/ProofFileField';
import { PROOF_OF_RETURN_REQUIREMENT } from '@/features/documents/proofRequirement';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

import { useEmptyContainerActions } from './useEmptyContainerActions';

/**
 * "Confirm return" asks for the depot's receipt, wherever it is clicked from.
 *
 * Confirming a return is the moment the whole job ends: detention stops, the
 * cycle closes, and the booking that owed the container is completed. All three
 * used to happen on one click and nothing else — a container was home because
 * somebody said so. The backend now refuses the close without a proof of
 * return, so this is where the file is asked for.
 *
 * A hook rather than a component because the button lives in two places — the
 * container's dossier and its row in the queue — and both should ask the same
 * question in the same words. Each host renders `{dialog}` beside its button.
 */
export function useReturnProofPrompt() {
  const actions = useEmptyContainerActions();
  const [pending, setPending] = useState<EmptyReturnRecord | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const prompt = (record: EmptyReturnRecord) => {
    setFiles([]);
    setError('');
    setPending(record);
  };

  const close = () => {
    setPending(null);
    setFiles([]);
    setError('');
  };

  const confirm = async () => {
    if (!pending) return;
    if (files.length === 0) {
      setError(PROOF_OF_RETURN_REQUIREMENT.missing);
      return;
    }
    setSaving(true);
    const ok = await actions.confirmReturn(pending, files);
    setSaving(false);
    /* A refusal is reported through the module's own toast by `confirmReturn`,
       so the dialog stays open holding the files rather than making somebody
       pick four photographs again. */
    if (ok) close();
  };

  const dialog = pending ? (
    <Dialog open onOpenChange={(next) => !next && !saving && close()}>
      <DialogContent size="sm" className="p-0" onClick={(event) => event.stopPropagation()}>
        <DialogHeader title={PROOF_OF_RETURN_REQUIREMENT.title}>
          <span className="text-xs text-muted-foreground">
            {pending.container || pending.bookingReference}
          </span>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <p className="text-[11px] text-muted-foreground">{PROOF_OF_RETURN_REQUIREMENT.hint}</p>
          <ProofFileField
            files={files}
            disabled={saving}
            label="Add the depot receipt or a photograph of it"
            onChange={(next) => {
              setFiles(next);
              setError('');
            }}
          />
          {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void confirm()}>
            {saving ? 'Closing…' : 'Confirm return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { prompt, dialog, busy: saving || actions.isBusy };
}
