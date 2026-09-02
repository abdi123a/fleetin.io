import { useState } from 'react';

import { Input, Select, Spinner } from '@/design-system';
import { Search, X } from '@/design-system/icons';
import { cn } from '@/utils';

import { useRecordSearch } from '../api/queries';
import { RecordChip } from '../composer/RecordChip';
import { RECORD_TYPE_LABEL, RECORD_TYPES, type RecordType } from '../contracts';

export interface PickedRecord {
  recordType: RecordType;
  recordId: string;
  recordRef: string;
  label?: string | null;
  status?: string | null;
}

/**
 * "What is this about?" — one search box over every record type at once.
 *
 * Deliberately not a type dropdown followed by a record dropdown. The person
 * filling this in has a reference in front of them, read off a phone call —
 * `SHP-107`, a plate, a container number — and knowing which of ten Fleetin
 * tables it belongs to is our problem, not theirs. The server already resolves
 * a reference to its type for the composer's `/` menu; this is the same search
 * with a form control around it.
 */
export function RecordPicker({
  value,
  onChange,
  placeholder = 'Type a reference or a name…',
}: {
  value: PickedRecord | null;
  onChange: (record: PickedRecord | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  /* Empty means "anything". The kind is a narrowing, not a required first
     step: somebody reading a reference off a phone call already knows what it
     is, and making them classify it before they can type it is a question we
     can answer ourselves. */
  const [kind, setKind] = useState<RecordType | ''>('');
  const { data: all = [], isFetching } = useRecordSearch(q);
  const results = kind ? all.filter((record) => record.type === kind) : all;

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2">
        <RecordChip
          recordType={value.recordType}
          reference={value.recordRef}
          label={value.label}
          status={value.status}
          static
        />
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ('');
          }}
          aria-label="Clear the record"
          className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="w-40 shrink-0">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as RecordType | '')}
            aria-label="Kind of record"
          >
            <option value="">Anything</option>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {RECORD_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isFetching ? (
          <Spinner className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        ) : null}
        </div>
      </div>

      {q.trim().length >= 2 && (
        <ul className="max-h-52 overflow-y-auto rounded-md border border-border bg-card">
          {results.map((record) => (
            <li key={`${record.type}:${record.id}`}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    recordType: record.type,
                    recordId: record.id,
                    recordRef: record.reference,
                    label: record.subtitle,
                    status: record.status,
                  })
                }
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                  'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                )}
              >
                <span className="w-20 shrink-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {RECORD_TYPE_LABEL[record.type]}
                </span>
                <span className="font-mono text-xs font-bold text-foreground">
                  {record.reference}
                </span>
                {record.subtitle ? (
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {record.subtitle}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {!isFetching && results.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">
              Nothing matches “{q.trim()}”.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
