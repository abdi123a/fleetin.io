import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  BadgeCheck,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Info,
  Landmark,
  List,
  LogOut,
  Receipt,
  Sun,
} from '@/design-system/icons';
import type { DocumentTemplate, DocumentTemplateField } from '@/features/hr/api/hrService';
import {
  downloadBordereauXlsx,
  issuedDocumentFile,
  openDocumentBlob,
} from '@/features/hr/api/hrService';
import {
  useDocumentPreview,
  useDocumentTemplates,
  useEmployees,
  useIssueDocument,
  useLeaveRecords,
  usePayrollPeriods,
} from '@/features/hr/api/queries';
import { ActionButton, EmptyState, PageHead, Panel, Pill } from '@/pages/finance/components/kit';
import { cn } from '@/utils';

import { Field, FormError, inputClass } from './components/form';
import { frDate, monthLabelFr } from './hrFormat';

/**
 * The document generator: pick a document, fill in only what that document
 * needs, issue it.
 *
 * The preview is an iframe fed the server's own HTML, not a second renderer
 * built in React. That is the whole point — the preview and the issued PDF
 * come out of one template on one machine, so they cannot drift. It costs a
 * round trip per keystroke-settled change and buys the guarantee that what
 * the user approved is what got filed.
 *
 * Two honest departures from the prototype:
 *
 * 1. The reference number is shown but not editable. The server allocates it
 *    inside the issuing transaction so two people cannot collide, and an input
 *    whose value is discarded on submit is worse than no input at all. What is
 *    shown is the number that *would* be allocated next.
 * 2. Nothing is issued twice by accident — the issue button is disabled while
 *    the mutation is in flight and the result panel replaces it afterwards.
 */

const TEMPLATE_ICON: Record<string, typeof FileText> = {
  attestation_travail: BadgeCheck,
  attestation_conge: Sun,
  indemnite_fin: LogOut,
  bulletin_paie: Receipt,
  bordereau_cnss: List,
  ordre_virement: Landmark,
};

const TEMPLATE_SUB: Record<string, string> = {
  attestation_travail: 'Proof of employment',
  attestation_conge: 'Approved leave confirmation',
  indemnite_fin: 'End-of-service settlement',
  bulletin_paie: 'Payslip for one period',
  bordereau_cnss: 'Liste du personnel — monthly filing',
  ordre_virement: 'Salary transfer letter to the bank',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

/** `default: 'today'` in the seed means "the day it is issued", not a literal. */
function defaultFor(field: DocumentTemplateField): unknown {
  if (field.default === 'today') return todayIso();
  if (field.default !== undefined) return field.default;
  return field.type === 'toggle' ? false : '';
}

function initialFields(template: DocumentTemplate): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of template.requiresFields) values[field.key] = defaultFor(field);
  return values;
}

export function HrDocumentsPage() {
  const [searchParams] = useSearchParams();
  const { data: templates = [], isLoading: templatesLoading } = useDocumentTemplates();
  const { data: employeePage } = useEmployees({ status: 'ACTIVE', limit: 200 });
  const { data: periods = [] } = usePayrollPeriods();

  const employees = useMemo(() => employeePage?.items ?? [], [employeePage]);

  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [fields, setFields] = useState<Record<string, unknown>>({});

  const template = templates.find((entry) => entry.key === templateKey) ?? null;

  /* Arriving from an employee's file — "issue a document for this person". */
  useEffect(() => {
    const requested = searchParams.get('employeeId');
    if (requested) setEmployeeId(requested);
  }, [searchParams]);

  /* The period a payroll document defaults to is the newest one that has
     actually been calculated; a DRAFT period has no lines to file. */
  useEffect(() => {
    if (periodId || periods.length === 0) return;
    const usable = periods.find((entry) => entry.status !== 'DRAFT') ?? periods[0];
    if (usable) setPeriodId(usable.id);
  }, [periods, periodId]);

  useEffect(() => {
    if (!employeeId && employees.length > 0 && employees[0]) setEmployeeId(employees[0].id);
  }, [employees, employeeId]);

  function chooseTemplate(next: DocumentTemplate) {
    setTemplateKey(next.key);
    setFields(initialFields(next));
  }

  const setField = (key: string, value: unknown) =>
    setFields((previous) => ({ ...previous, [key]: value }));

  const isEmployeeScope = template?.scope === 'EMPLOYEE';
  const employee = employees.find((entry) => entry.id === employeeId) ?? null;

  /* A period-scope document carries its period as the top-level argument; an
     employee-scope one that needs a period (the payslip) carries it as a
     field, because that is where the template asks for it. */
  const fieldsForRequest = useMemo(() => {
    if (!template) return {};
    const needsPeriodField = template.requiresFields.some((field) => field.type === 'period');
    return needsPeriodField ? { ...fields, periodId } : fields;
  }, [template, fields, periodId]);

  const missingRequired = (template?.requiresFields ?? []).filter((field) => {
    if (!field.required) return false;
    if (field.type === 'period') return !periodId;
    const value = fieldsForRequest[field.key];
    return value === '' || value === undefined || value === null;
  });

  const ready = Boolean(
    template && (isEmployeeScope ? employeeId : periodId) && missingRequired.length === 0,
  );

  const preview = useDocumentPreview({
    template: template?.key,
    employeeId: isEmployeeScope ? employeeId : undefined,
    periodId: periodId || undefined,
    fields: fieldsForRequest,
    enabled: ready,
  });

  const issue = useIssueDocument();
  const [issued, setIssued] = useState<{ id: string; referenceNo: string } | null>(null);

  /*
   * `placeholderData` keeps the last render on screen while the next one
   * loads, which is what stops the pane flashing empty on every keystroke —
   * but it also means the last *document's* reference number survives a switch
   * to a document that is not ready yet. Showing a number belonging to another
   * document is worse than showing none, so the reference is gated on `ready`.
   */
  const reference = ready ? (issued?.referenceNo ?? preview.data?.referenceNo) : undefined;

  /* A change of any input makes the last issue stale — clearing it stops the
     "Open PDF" button from handing back a document for different values. */
  useEffect(() => {
    setIssued(null);
    issue.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, employeeId, periodId, fields]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Documents"
        subtitle="Every document is rendered from one template on the server — the preview and the filed PDF cannot drift."
        badge={<Pill tone="teal">{templates.length} templates</Pill>}
      />

      <div className="grid gap-4 xl:grid-cols-[380px_1fr] xl:items-start">
        <div className="space-y-4">
          <Panel
            title="1 · Choose a document"
            subtitle="Scope decides what the next step asks for"
            padded={false}
          >
            {templatesLoading ? (
              <div className="px-5 pb-5">
                <EmptyState message="Loading the catalogue…" />
              </div>
            ) : (
              <div className="space-y-4 px-5 pb-5">
                <TemplateGroup
                  label="For one employee"
                  templates={templates.filter((entry) => entry.scope === 'EMPLOYEE')}
                  active={templateKey}
                  onChoose={chooseTemplate}
                />
                <TemplateGroup
                  label="For a payroll period"
                  templates={templates.filter((entry) => entry.scope === 'PERIOD')}
                  active={templateKey}
                  onChoose={chooseTemplate}
                />
              </div>
            )}
          </Panel>

          <Panel
            title={
              !template
                ? '2 · Choose the employee'
                : isEmployeeScope
                  ? '2 · Choose the employee'
                  : '2 · Confirm the period'
            }
            subtitle={
              template
                ? 'Only what this document actually needs'
                : 'Pick a document type first'
            }
            className={template ? undefined : 'opacity-50'}
          >
            {!template ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Nothing to fill in yet.
              </p>
            ) : (
              <div className="space-y-4">
                {isEmployeeScope ? (
                  <Field
                    label="Employee"
                    required
                    hint={
                      employee
                        ? `Joined ${frDate(employee.joiningDate)} · ${employee.profession}${
                            employee.department ? ` · ${employee.department}` : ''
                          }`
                        : undefined
                    }
                  >
                    <select
                      className={inputClass}
                      value={employeeId}
                      onChange={(event) => setEmployeeId(event.target.value)}
                    >
                      {employees.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.fullName} — {entry.profession}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <PeriodField
                    periods={periods}
                    value={periodId}
                    onChange={setPeriodId}
                    hint="Only a calculated period has lines to file."
                  />
                )}

                {template.requiresFields.map((field) => (
                  <TemplateField
                    key={field.key}
                    field={field}
                    value={fields[field.key]}
                    onChange={(value) => setField(field.key, value)}
                    employeeId={employeeId}
                    periods={periods}
                    periodId={periodId}
                    onPeriodChange={setPeriodId}
                    onLeavePicked={(start, end) => {
                      setFields((previous) => ({
                        ...previous,
                        startDate: start,
                        endDate: end,
                      }));
                    }}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="3 · Issue"
            subtitle="Issuing freezes the document and files a copy"
            className={ready ? undefined : 'opacity-50'}
          >
            <div className="space-y-4">
              {/*
                Not an input. The number is minted by the server inside the
                issuing transaction — that is what stops two people issuing at
                once from colliding — so a text box the user can type into is a
                lie about who decides it. It reads as the generated value it is.
              */}
              <div>
                <span className="text-xs font-bold text-foreground">Reference number</span>
                <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-3 py-2">
                  <FileCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 font-mono text-sm font-bold tabular-nums text-foreground">
                    {reference ?? '—'}
                  </span>
                  <Pill tone={issued ? 'teal' : 'neutral'}>
                    {issued ? 'Issued' : 'Auto-generated'}
                  </Pill>
                </div>
                <span className="mt-1.5 block text-[11px] font-semibold leading-snug text-muted-foreground">
                  {issued
                    ? 'Consumed. Reissuing this document mints the next number in the series.'
                    : 'Allocated on issue, in sequence per document type per year.'}
                </span>
              </div>

              <FormError error={issue.error} />

              <div className="flex flex-wrap gap-2">
                <ActionButton
                  icon={Download}
                  variant="primary"
                  disabled={!ready || issue.isPending || preview.isError}
                  onClick={() => {
                    if (!template) return;
                    issue.mutate(
                      {
                        template: template.key,
                        employeeId: isEmployeeScope ? employeeId : undefined,
                        periodId: periodId || undefined,
                        fields: fieldsForRequest,
                      },
                      {
                        onSuccess: (result) => {
                          setIssued({
                            id: result.id,
                            referenceNo: result.referenceNo,
                          });
                          /* Through the API, not the storage URL: the bearer
                             token cannot ride on a `window.open`, which is why
                             the old link opened the dev server's 404. */
                          void openDocumentBlob(
                            () => issuedDocumentFile(result.id),
                            `${result.referenceNo}.pdf`,
                          );
                        },
                      },
                    );
                  }}
                >
                  {issue.isPending ? 'Issuing…' : 'Issue & download PDF'}
                </ActionButton>

                {template?.key === 'bordereau_cnss' ? (
                  <ActionButton
                    icon={FileSpreadsheet}
                    disabled={!ready}
                    onClick={() => void exportBordereau(periodId)}
                  >
                    Export XLSX
                  </ActionButton>
                ) : null}
              </div>

              {issued ? (
                <div className="flex items-start gap-2.5 rounded-card border border-primary/25 bg-primary-subtle px-3 py-2.5">
                  <BadgeCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary-subtle-foreground"
                  />
                  <p className="text-xs font-bold text-primary-subtle-foreground">
                    Issued as{' '}
                    <span className="font-mono">{issued.referenceNo}</span> and filed against the
                    employee. Reissuing produces a new number — documents are never overwritten.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-card border border-warning-subtle bg-warning-subtle px-3 py-2.5">
                  <Info
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warning-subtle-foreground"
                  />
                  <p className="text-xs font-semibold text-warning-subtle-foreground">
                    Issuing consumes the reference, stores the PDF and locks the issue date. The
                    preview beside this panel is the same render.
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <PreviewPane
          ready={ready}
          html={preview.data?.html}
          landscape={preview.data?.landscape}
          loading={preview.isFetching}
          error={preview.error}
          label={template?.label}
          reference={reference}
          missing={missingRequired.map((field) => field.label)}
        />
      </div>
    </div>
  );
}

async function exportBordereau(periodId: string) {
  const { blob, filename } = await downloadBordereauXlsx(periodId || undefined);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? 'bordereau-cnss.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}

function TemplateGroup({
  label,
  templates,
  active,
  onChoose,
}: {
  label: string;
  templates: DocumentTemplate[];
  active: string | null;
  onChoose: (template: DocumentTemplate) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1.5">
        {templates.map((template) => {
          const Icon = TEMPLATE_ICON[template.key] ?? FileText;
          const chosen = template.key === active;
          return (
            <button
              key={template.key}
              type="button"
              aria-pressed={chosen}
              onClick={() => onChoose(template)}
              className={cn(
                'flex w-full cursor-pointer items-start gap-3 rounded-card-nested border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                chosen
                  ? 'border-primary/30 bg-primary-subtle'
                  : 'border-border bg-card hover:bg-surface-sunken',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  chosen ? 'bg-primary text-primary-foreground' : 'bg-surface-sunken text-foreground',
                )}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-snug text-foreground">
                  {template.label}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                  {TEMPLATE_SUB[template.key] ?? `Version ${template.version}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodField({
  periods,
  value,
  onChange,
  label = 'Payroll period',
  hint,
}: {
  periods: ReturnType<typeof usePayrollPeriods>['data'];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
}) {
  const list = periods ?? [];
  const chosen = list.find((entry) => entry.id === value);
  return (
    <Field
      label={label}
      required
      hint={
        chosen
          ? `${chosen.status.toLowerCase()} · ${chosen._count.lines} lines · ${chosen.config.label}`
          : hint
      }
    >
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a period…</option>
        {list.map((period) => (
          <option key={period.id} value={period.id}>
            {monthLabelFr(period.month, period.year)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** One input from the template's own `requiresFields` descriptor. */
function TemplateField({
  field,
  value,
  onChange,
  employeeId,
  periods,
  periodId,
  onPeriodChange,
  onLeavePicked,
}: {
  field: DocumentTemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  employeeId: string;
  periods: ReturnType<typeof usePayrollPeriods>['data'];
  periodId: string;
  onPeriodChange: (value: string) => void;
  onLeavePicked: (start: string, end: string) => void;
}) {
  if (field.type === 'period') {
    return (
      <PeriodField
        periods={periods}
        value={periodId}
        onChange={onPeriodChange}
        label={field.label}
        hint={field.hint}
      />
    );
  }

  if (field.type === 'leave') {
    return (
      <ApprovedLeaveField
        label={field.label}
        employeeId={employeeId}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        onPicked={onLeavePicked}
      />
    );
  }

  if (field.type === 'toggle') {
    return (
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span className="min-w-0">
          <span className="block text-xs font-bold text-foreground">{field.label}</span>
          {field.hint ? (
            <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-muted-foreground">
              {field.hint}
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <Field label={field.label} required={field.required} hint={field.hint}>
      <input
        type="date"
        className={inputClass}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/**
 * The attestation de congé is populated from an approved leave record rather
 * than typed twice — picking one fills the two dates below it, which stay
 * editable for the case where the paper has to say something slightly else.
 */
function ApprovedLeaveField({
  label,
  employeeId,
  value,
  onChange,
  onPicked,
}: {
  label: string;
  employeeId: string;
  value: string;
  onChange: (value: unknown) => void;
  onPicked: (start: string, end: string) => void;
}) {
  const { data: records = [] } = useLeaveRecords({ employeeId, status: 'APPROVED' });

  return (
    <Field
      label={label}
      hint={
        records.length === 0
          ? 'No approved leave on file — enter the dates by hand below.'
          : 'Picking one fills the dates below.'
      }
    >
      <select
        className={inputClass}
        value={value}
        onChange={(event) => {
          const id = event.target.value;
          onChange(id);
          const record = records.find((entry) => entry.id === id);
          if (record) onPicked(record.startDate.slice(0, 10), record.endDate.slice(0, 10));
        }}
      >
        <option value="">Enter the dates by hand</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {frDate(record.startDate)} → {frDate(record.endDate)} ({record.days} d)
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The paper. Rendered in an iframe rather than injected into the page: the
 * document's own print stylesheet must not leak into the app's, and the app's
 * must not leak into the document's.
 */
function PreviewPane({
  ready,
  html,
  landscape,
  loading,
  error,
  label,
  reference,
  missing,
}: {
  ready: boolean;
  html?: string;
  landscape?: boolean;
  loading: boolean;
  error: unknown;
  label?: string;
  reference?: string;
  missing: string[];
}) {
  return (
    <Panel
      title="Preview"
      subtitle={label ? `${label}${loading ? ' — rendering…' : ''}` : 'Nothing selected yet'}
      action={
        reference ? (
          <Pill tone="neutral">
            <span className="font-mono">{reference}</span>
          </Pill>
        ) : null
      }
      padded={false}
      className="xl:sticky xl:top-4"
    >
      <div className="px-5 pb-5">
        {!ready ? (
          <div className="grid min-h-[420px] place-items-center rounded-card border border-dashed border-border bg-surface-sunken px-6 text-center">
            <div>
              <p className="text-sm font-extrabold text-foreground">
                {missing.length > 0 ? 'One more thing' : 'No document selected'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs font-semibold text-muted-foreground">
                {missing.length > 0
                  ? `Fill in ${missing.join(', ')} to see the preview.`
                  : 'Pick a document type on the left. The preview fills in from the employee record, the payroll period and company settings as you go.'}
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="grid min-h-[420px] place-items-center rounded-card border border-destructive-subtle bg-destructive-subtle px-6 text-center">
            <p className="max-w-md text-sm font-bold text-destructive-subtle-foreground">
              {error instanceof Error ? error.message : 'The document could not be rendered.'}
            </p>
          </div>
        ) : !html ? (
          <div className="grid min-h-[420px] place-items-center rounded-card border border-border bg-surface-sunken">
            <p className="text-xs font-bold text-muted-foreground">Rendering…</p>
          </div>
        ) : (
          <Paper html={html} landscape={landscape} loading={loading} />
        )}
      </div>
    </Panel>
  );
}

/**
 * A sheet of A4, to scale.
 *
 * The server prints A4 with 15 mm margins, so the preview draws the same
 * page — full paper, same margins — and scales the whole thing down to the
 * column. Fitting the *content* to the column instead would be a different
 * line-breaking than the PDF gets, and a preview that breaks lines elsewhere
 * than the filed document is worse than no preview.
 *
 * Keyed on the HTML so a changed document mounts a fresh frame: a sandboxed
 * `srcdoc` frame does not reliably re-navigate when the attribute is swapped
 * underneath it, and it kept showing the blank first render.
 */
function Paper({
  html,
  landscape,
  loading,
}: {
  html: string;
  landscape?: boolean;
  loading: boolean;
}) {
  const PX_PER_MM = 96 / 25.4;
  const paperWidth = (landscape ? 297 : 210) * PX_PER_MM;
  const paperHeight = (landscape ? 210 : 297) * PX_PER_MM;

  const frame = useRef<HTMLDivElement>(null);
  /* `null` until measured, so the frame is never mounted at the wrong size. */
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    // Never scale a page up — a document blown past 100% reads as a zoom bug.
    const measure = (width: number) => setScale(Math.min(1, width / paperWidth));
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [paperWidth]);

  return (
    <div ref={frame} className={cn('w-full', loading && 'opacity-60 transition-opacity')}>
      {/*
       * `zoom` rather than `transform: scale()`, and the frame keyed on both
       * the document and the zoom it was mounted at.
       *
       * Both facts were paid for: a transform on an ancestor stops a sandboxed
       * frame painting at all, and changing the zoom *after* the frame has
       * loaded blanks it the same way. Zoom fixed at mount does neither, so
       * the frame is remounted whenever either changes — at one preview per
       * screen that costs nothing and it is the only version that survives a
       * window resize.
       */}
      {scale === null ? null : (
        <div
          className="border border-border bg-white shadow-card"
          style={{ width: paperWidth, height: paperHeight, padding: '15mm', zoom: scale }}
        >
          <iframe
            key={`${scale}:${html}`}
            title="Document preview"
            srcDoc={html}
            sandbox=""
            className="size-full border-0"
          />
        </div>
      )}
    </div>
  );
}

export default HrDocumentsPage;
