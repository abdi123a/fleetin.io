import { useEffect, useMemo, useState } from 'react';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconChip,
  Input,
  Select,
} from '@/design-system';
import { FileText, Plus, Upload, X } from '@/design-system/icons';
import { useInsurerStore } from '@/stores/insurer.store';
import { cn } from '@/utils';

import type { DocumentTypeSpec } from '../catalog';

/** What the operator read off the paper, ready to be filed. */
export interface DocumentCapture {
  file: File;
  /** `YYYY-MM-DD` — the day it was issued. */
  issueDate: string;
  /** `YYYY-MM-DD` — the day it lapses. */
  expiryDate: string;
  /** The insurer, when the paper is a policy. */
  issuer?: string;
}

/**
 * File a compliance paper: the scan, the day it was issued, the day it lapses.
 *
 * Every document in Fleetin is filed through this one dialog, because every
 * document is the same three questions. It used to be a bare `<input
 * type="file">` on each of four pages, which stored a file and nothing else —
 * so the system held a grey card it could not tell you was eleven months out
 * of date, and "compliance" meant "somebody uploaded something once".
 *
 * Both dates are required. That is the whole point of the dialog: an undated
 * certificate cannot be renewed, cannot raise an alert, and cannot be told
 * apart from the one it replaced.
 *
 * ## The insurer
 *
 * One paper asks a fourth question. A motor policy is worth whatever the
 * company behind it is worth — a claim is made against the insurer, not
 * against the certificate — so the vehicle's insurance carries the company's
 * name, picked from the list rather than typed, with "add" for one the list
 * has not met. Declared by the catalog (`DocumentTypeSpec.issuer`), so no
 * other paper grows the field by accident.
 */
export function DocumentCaptureDialog({
  open,
  spec,
  /** What the paper belongs to — "Truck DJ-4471", "Ahmed Robleh". */
  subject,
  busy = false,
  error,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  spec: DocumentTypeSpec | null;
  subject?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (capture: DocumentCapture) => void;
}) {
  const insurers = useInsurerStore((state) => state.insurers);
  const addInsurer = useInsurerStore((state) => state.addInsurer);

  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issuer, setIssuer] = useState('');
  const [newIssuer, setNewIssuer] = useState('');
  const [addingIssuer, setAddingIssuer] = useState(false);
  const [ownError, setOwnError] = useState('');

  /* A fresh dialog every time it opens. Reopening on the next document with
     the last one's dates still in the fields is how a truck ends up insured
     to the same day as the truck before it. */
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setIssueDate('');
    setExpiryDate('');
    setIssuer(spec?.issuer ? (insurers[0]?.label ?? '') : '');
    setNewIssuer('');
    setAddingIssuer(false);
    setOwnError('');
  }, [open, spec, insurers]);

  const insurerOptions = useMemo(
    () => insurers.map((entry) => ({ value: entry.label, label: entry.label })),
    [insurers],
  );

  if (!spec) return null;

  const submit = () => {
    if (!file) return setOwnError('Choose the scanned document.');
    if (!issueDate) return setOwnError('Enter the registration date printed on it.');
    if (!expiryDate) return setOwnError('Enter the date it expires.');
    if (new Date(expiryDate) <= new Date(issueDate)) {
      return setOwnError('It cannot expire on or before the day it was issued.');
    }
    if (spec.issuer && !issuer.trim()) return setOwnError(`Choose the ${spec.issuer.label.toLowerCase()}.`);

    setOwnError('');
    onSubmit({ file, issueDate, expiryDate, issuer: spec.issuer ? issuer.trim() : undefined });
  };

  const saveNewIssuer = () => {
    const added = addInsurer(newIssuer);
    setIssuer(added.label);
    setNewIssuer('');
    setAddingIssuer(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent size="sm" className="p-0">
        <DialogHeader title={spec.label}>
          {subject ? <span className="text-xs text-muted-foreground">{subject}</span> : null}
        </DialogHeader>

        <DialogBody className="space-y-3.5">
          {/* The file.
           *
           * A whole-width drop target rather than a button: it is the one thing
           * that cannot be skipped, and once chosen it has to keep saying which
           * file it holds — an operator filing forty certificates needs to see
           * that this row is the right scan before dating it. */}
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 transition-colors',
              file
                ? 'border-success/50 bg-success-subtle/40'
                : 'border-primary/40 bg-primary/5 hover:bg-primary/10',
            )}
          >
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) {
                  setFile(chosen);
                  setOwnError('');
                }
              }}
            />
            <IconChip icon={file ? FileText : Upload} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-foreground">
                {file ? file.name : 'Choose the scanned document'}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {file ? `${(file.size / 1024).toFixed(0)} KB` : 'PDF or photograph'}
              </span>
            </span>
          </label>

          {/* Both dates, side by side, because they are read off the same line
              of the same paper. */}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="space-y-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Registered
              </span>
              <Input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Expires
              </span>
              <Input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>
          </div>

          {spec.issuer && (
            <div className="space-y-1">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {spec.issuer.label}
              </span>
              {addingIssuer ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    placeholder="Company name"
                    value={newIssuer}
                    onChange={(event) => setNewIssuer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newIssuer.trim()) {
                        event.preventDefault();
                        saveNewIssuer();
                      }
                    }}
                  />
                  <Button type="button" size="sm" disabled={!newIssuer.trim()} onClick={saveNewIssuer}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Cancel adding a company"
                    onClick={() => {
                      setAddingIssuer(false);
                      setNewIssuer('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={issuer}
                    options={insurerOptions}
                    onChange={(event) => setIssuer(event.target.value)}
                  />
                  {/* The list is small and local, so an insurer it has never
                      met is added here rather than in a settings screen
                      somebody would have to go and find mid-filing. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setAddingIssuer(true)}
                  >
                    New
                  </Button>
                </div>
              )}
            </div>
          )}

          {(ownError || error) && (
            <p className="text-[11px] font-medium text-destructive">{ownError || error}</p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={submit}>
            {busy ? 'Filing…' : 'File document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
