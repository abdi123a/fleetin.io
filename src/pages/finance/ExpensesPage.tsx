import { useMemo, useState, type ComponentType } from 'react';

import {
  DataTable,
  FilterBar,
  PageHeader,
  RecordStatusBadge,
  TablePager,
  ViewTabs,
  usePagedRows,
  type DataColumn,
} from '@/components';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconChip,
  Label,
  Skeleton,
  Textarea,
  useConfirm,
  type IconChipTint,
} from '@/design-system';
import {
  Banknote,
  CheckCircle,
  Clock,
  Hourglass,
  MoreVertical,
  Paperclip,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  Undo2,
  XCircle,
} from '@/design-system/icons';
import { usePermissions } from '@/hooks';
import {
  openExpenseReceipt,
  useApproveExpense,
  useDeleteRecurringExpense,
  useExpenses,
  usePayExpense,
  usePostRecurringExpense,
  useRecurringExpenses,
  useRejectExpense,
  useUpdateRecurringExpense,
  useWithdrawExpense,
  type ExpenseRecord,
  type ExpenseStatus,
  type RecurringExpenseRecord,
} from '@/features/finance';
import { useAuthStore } from '@/stores';
import { compactDjf, fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { cn } from '@/utils';

import { AddExpenseDialog, AddRecurringExpenseDialog } from './components/ExpenseDialogs';
import {
  EXPENSE_STATUS_OPTIONS,
  categoryOption,
  expenseStatusOption,
  frequencyLabel,
} from './expenseCatalog';

/**
 * What it costs to run Fleetin — the other side of the money, and the only
 * page in the module that is not about a shipment.
 *
 * Two views, because a cost arrives in exactly two ways and they are not the
 * same kind of thing:
 *
 *   - **Expenses** — money that has already gone. Anybody who logs in files
 *     one with its receipt; it lands `Submitted`, an admin approves it, and
 *     only then is it a cost the company has accepted. The person holding the
 *     receipt is almost never the person who runs the accounts, and a book
 *     only finance can type into is a book that learns about November in
 *     December.
 *   - **Recurring** — money that has not gone yet. Rent, salaries, the
 *     insurance premium. A template is a standing obligation and never a
 *     payment: booking a due period writes a real expense for it. Every figure
 *     in the book is therefore money somebody recorded, not money somebody
 *     predicted.
 *
 * **The two never share a control.** Each view carries exactly one page action
 * — Add expense here, Add recurring cost there — because the pair of buttons
 * side by side was how a month's rent got filed as though it were a taxi fare.
 * Same reason the two dialogs look nothing alike: one asks for a receipt, the
 * other for a rhythm.
 *
 * Built on the house list idiom — one band for the view and the page action,
 * one for the filters, then the shared `DataTable` that becomes cards on a
 * narrow screen with a ⋮ menu per row — so a row here reads exactly like a
 * row on the invoice list or the fleet directories.
 */

type View = 'claims' | 'recurring';
type StatusFilter = 'all' | ExpenseStatus;

export function ExpensesPage() {
  const { can } = usePermissions();
  const me = useAuthStore((state) => state.user?.id);
  const { confirm, confirmDialog } = useConfirm();

  const [view, setView] = useState<View>('claims');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState<View | null>(null);
  const [rejecting, setRejecting] = useState<ExpenseRecord | null>(null);

  const canApprove = can('expenses.approve');
  const canPay = can('expenses.pay');
  const canManage = can('expenses.manage');
  /** The whole book, rather than only your own claims. */
  const seesEverything = can('expenses.view');

  const { data: expenses = [], isLoading } = useExpenses();
  /* Only fetched for accounts that may see it — an employee filing a fuel
     receipt has no business knowing what the company pays in rent, and the
     server refuses the call anyway. */
  const { data: templates = [], isLoading: templatesLoading } = useRecurringExpenses({
    enabled: seesEverything,
  });

  const approve = useApproveExpense();
  const pay = usePayExpense();
  const withdraw = useWithdrawExpense();
  const post = usePostRecurringExpense();
  const updateTemplate = useUpdateRecurringExpense();
  const deleteTemplate = useDeleteRecurringExpense();

  /* ─── The four figures ───────────────────────────────────────────────── */

  const model = useMemo(() => summarise(expenses, templates), [expenses, templates]);

  /* ─── Claims ─────────────────────────────────────────────────────────── */

  const filteredClaims = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (status !== 'all' && expense.status !== status) return false;
      if (!term) return true;
      return (
        expense.number.toLowerCase().includes(term) ||
        expense.description.toLowerCase().includes(term) ||
        (expense.vendorOrPayee ?? '').toLowerCase().includes(term) ||
        expense.createdByName.toLowerCase().includes(term)
      );
    });
  }, [expenses, status, search]);

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (template) =>
        template.reference.toLowerCase().includes(term) ||
        template.description.toLowerCase().includes(term) ||
        template.vendorOrPayee.toLowerCase().includes(term),
    );
  }, [templates, search]);

  const pagedClaims = usePagedRows(filteredClaims, { resetKey: `claims:${status}:${search}` });
  const pagedTemplates = usePagedRows(filteredTemplates, { resetKey: `recurring:${search}` });

  const statusTabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All', count: expenses.length },
      ...EXPENSE_STATUS_OPTIONS.map((option) => ({
        key: option.value as StatusFilter,
        label: option.label,
        count: expenses.filter((expense) => expense.status === option.value).length,
      }))
        /* A tab for a state nothing is in is a dead control — Rejected is
           usually empty, and hiding it keeps the bar honest. */
        .filter((tab) => tab.count > 0),
    ],
    [expenses],
  );

  const claimColumns: DataColumn<ExpenseRecord>[] = [
    {
      key: 'what',
      label: 'Expense',
      icon: Receipt,
      width: 'w-[27%]',
      card: 'identity',
      cell: (expense) => {
        const category = categoryOption(expense.category);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <IconChip
              icon={category.icon}
              size={36}
              tint={expense.status === 'Rejected' ? 'neutral' : 'teal'}
              className="hidden shrink-0 sm:inline-flex"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground" title={expense.description}>
                {expense.description}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {category.label}
                {expense.vendorOrPayee ? ` · ${expense.vendorOrPayee}` : ''}
              </span>
            </span>
          </div>
        );
      },
    },
    {
      key: 'number',
      label: 'Reference',
      width: 'w-[12%]',
      cell: (expense) => (
        <div className="leading-tight">
          <p className="truncate font-mono text-xs font-semibold text-foreground">{expense.number}</p>
          {expense.isRecurring ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Repeat className="size-3" />
              {expense.periodLabel}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'who',
      label: 'Filed by',
      width: 'w-[16%]',
      /* Who approved it under who filed it — the two names are the whole
         story of a claim, and a second line that only appears once somebody
         has ruled makes the unruled rows read as the queue they are. */
      cell: (expense) => (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm text-foreground">{expense.createdByName}</p>
          {expense.approvedByName ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {expense.status === 'Rejected' ? 'refused' : 'approved'} by {expense.approvedByName}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'when',
      label: 'Spent',
      width: 'w-[12%]',
      cell: (expense) => (
        <div className="text-sm leading-tight">
          <p className="whitespace-nowrap text-foreground">{fmtDocDate(expense.incurredAt)}</p>
          {expense.paidAt ? (
            <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
              settled {fmtDocDate(expense.paidAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      width: 'w-[14%]',
      align: 'right',
      cell: (expense) => (
        <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
          {fmtDjf(fromMinorUnits(expense.amountMinorUnits, expense.currency))}
        </p>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-[12%]',
      card: 'trailing',
      cell: (expense) => (
        <span title={expense.rejectionReason ?? undefined}>
          <RecordStatusBadge option={expenseStatusOption(expense.status)} />
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      /* 7%, not 5%: the ⋮ button fits at 5% and the word above it does not. */
      width: 'w-[7%]',
      card: 'trailing',
      cell: (expense) => (
        <div className="flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                aria-label={`${expense.number} actions`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {expense.receiptKey ? (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    void openExpenseReceipt(expense);
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Open receipt</span>
                </DropdownMenuItem>
              ) : null}

              {canApprove && expense.status === 'Submitted' ? (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    approve.mutate(expense.id);
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  <span>Approve</span>
                </DropdownMenuItem>
              ) : null}

              {/* Only an approved claim can be paid — the server refuses the
                  rest, and an item that only teaches a rule wastes a click. */}
              {canPay && expense.status === 'Approved' ? (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    pay.mutate({ id: expense.id });
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <Banknote className="h-3.5 w-3.5 text-success" />
                  <span>Record payment</span>
                </DropdownMenuItem>
              ) : null}

              {canApprove && expense.status === 'Submitted' ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      setRejecting(expense);
                    }}
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Refuse claim</span>
                  </DropdownMenuItem>
                </>
              ) : null}

              {/* Your own, and only before anybody has ruled on it. */}
              {expense.createdById === me && expense.status === 'Submitted' ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async (event) => {
                      event.stopPropagation();
                      const ok = await confirm({
                        title: `Withdraw ${expense.number}?`,
                        description: 'The claim and its receipt are deleted. File it again if you need to.',
                        confirmLabel: 'Withdraw',
                        destructive: true,
                      });
                      if (ok) withdraw.mutate(expense.id);
                    }}
                    className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    <span>Withdraw claim</span>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  /* ─── Recurring ──────────────────────────────────────────────────────── */

  const now = Date.now();

  const templateColumns: DataColumn<RecurringExpenseRecord>[] = [
    {
      key: 'what',
      label: 'Obligation',
      icon: Repeat,
      width: 'w-[30%]',
      card: 'identity',
      cell: (template) => {
        const category = categoryOption(template.category);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <IconChip
              icon={category.icon}
              size={36}
              tint={template.isActive ? 'teal' : 'neutral'}
              className="hidden shrink-0 sm:inline-flex"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {template.description}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {category.label} · {template.vendorOrPayee}
              </span>
            </span>
          </div>
        );
      },
    },
    {
      key: 'rhythm',
      label: 'How often',
      width: 'w-[13%]',
      cell: (template) => (
        <div className="leading-tight">
          <p className="text-sm text-foreground">{frequencyLabel(template.frequency)}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{template.reference}</p>
        </div>
      ),
    },
    {
      key: 'due',
      label: 'Next due',
      width: 'w-[15%]',
      cell: (template) => {
        const due = new Date(template.nextDueAt).getTime();
        const overdue = template.isActive && due < now;
        return (
          <div className="text-sm leading-tight">
            <p
              className={cn(
                'whitespace-nowrap',
                overdue ? 'font-semibold text-warning-strong-foreground' : 'text-foreground',
              )}
            >
              {fmtDocDate(template.nextDueAt)}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
              {!template.isActive
                ? 'paused'
                : template.lastPostedAt
                  ? `last booked ${fmtDocDate(template.lastPostedAt)}`
                  : 'never booked'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'amount',
      label: 'Amount',
      width: 'w-[17%]',
      align: 'right',
      cell: (template) => {
        const each = fromMinorUnits(template.amountMinorUnits, template.currency);
        const monthly = fromMinorUnits(template.monthlyMinorUnits, template.currency);
        return (
          <div className="leading-tight">
            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
              {fmtDjf(each)}
            </p>
            {/* Only where it says something the headline cannot: a monthly
                figure repeated under itself is the page talking twice. */}
            {template.frequency !== 'MONTHLY' ? (
              <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                {fmtDjf(Math.round(monthly))} a month
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'book',
      label: 'Due now',
      width: 'w-[18%]',
      card: 'action',
      /* The control, not the noun. An obligation that is due renders the
         button that discharges it — naming the gap and leaving the reader to
         find the action elsewhere is how a due rent stays unbooked.
         Nothing at all when nothing is due: this is the card's full-width
         action slot, and an em-dash alone on that row is a line of noise
         under every obligation that is simply up to date. */
      cell: (template) => {
        const due = new Date(template.nextDueAt).getTime();
        if (!canManage || !template.isActive || due > now) return null;
        return (
          <Button
            size="sm"
            variant="outline"
            disabled={post.isPending}
            onClick={(event) => {
              event.stopPropagation();
              post.mutate(template.id);
            }}
          >
            Book {fmtDocDate(template.nextDueAt)}
          </Button>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      width: 'w-[7%]',
      card: 'trailing',
      cell: (template) =>
        canManage ? (
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${template.reference} actions`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTemplate.mutate({
                      id: template.id,
                      payload: { isActive: !template.isActive },
                    });
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{template.isActive ? 'Pause' : 'Resume'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async (event) => {
                    event.stopPropagation();
                    const ok = await confirm({
                      title: `Delete ${template.reference}?`,
                      description:
                        'Only possible while it has booked nothing. Pause it instead to keep its history.',
                      confirmLabel: 'Delete',
                      destructive: true,
                    });
                    if (ok) deleteTemplate.mutate(template.id);
                  }}
                  className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span />
        ),
    },
  ];

  const error = (approve.error ??
    pay.error ??
    withdraw.error ??
    post.error ??
    updateTemplate.error ??
    deleteTemplate.error) as Error | undefined;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader title="Expenses" />

      {/*
        The four figures that decide what somebody does today, in the order a
        cost moves through the book: filed → approved → paid, and beside them
        what the company owes every month whether anybody files anything.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CostTile
          label="To approve"
          value={model.awaiting}
          note={
            model.awaitingCount > 0
              ? `${model.awaitingCount} claim${model.awaitingCount === 1 ? '' : 's'} filed`
              : 'nothing waiting'
          }
          icon={Hourglass}
          tone="pending"
          loading={isLoading}
        />
        <CostTile
          label="To pay"
          value={model.approved}
          note={
            model.approvedCount > 0
              ? `${model.approvedCount} approved, unpaid`
              : 'everything settled'
          }
          icon={Banknote}
          tone="out"
          loading={isLoading}
        />
        <CostTile
          label="Spent this month"
          value={model.paidThisMonth}
          note={model.topCategory ?? 'nothing paid yet'}
          icon={Receipt}
          tone="spent"
          loading={isLoading}
        />
        <CostTile
          label="Every month"
          value={model.monthlyCommitment}
          note={
            model.activeTemplates > 0
              ? `${model.activeTemplates} standing cost${model.activeTemplates === 1 ? '' : 's'}`
              : 'nothing recurring yet'
          }
          icon={Repeat}
          tone="standing"
          loading={templatesLoading && seesEverything}
        />
      </div>

      {/* View and page action share one band — the house rule. */}
      <ViewTabs
        label="Expense book"
        value={view}
        onChange={(next) => {
          setView(next);
          setStatus('all');
          setSearch('');
        }}
        tabs={[
          { key: 'claims', label: 'Expenses', icon: Receipt },
          ...(seesEverything ? [{ key: 'recurring' as const, label: 'Recurring', icon: Repeat }] : []),
        ]}
        /* One button, and it is always the one this view is about. No
           permission test on the first: `expenses.create` is what lets an
           account reach the page at all, and every one of them may file. */
        actions={
          view === 'claims' ? (
            <Button size="sm" onClick={() => setAdding('claims')}>
              <Plus className="mr-1.5 size-4" />
              Add expense
            </Button>
          ) : canManage ? (
            <Button size="sm" onClick={() => setAdding('recurring')}>
              <Plus className="mr-1.5 size-4" />
              Add recurring cost
            </Button>
          ) : undefined
        }
      />

      {view === 'claims' ? (
        <FilterBar
          tabs={statusTabs}
          active={status}
          onSelect={setStatus}
          label="Claim status"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Reference, description, payee or person',
            matched: filteredClaims.length,
            total: expenses.length,
          }}
        />
      ) : (
        <FilterBar
          tabs={[
            { key: 'all' as const, label: 'All', count: templates.length },
            { key: 'due' as const, label: 'Due', count: model.dueCount },
          ].filter((tab) => tab.key === 'all' || tab.count > 0)}
          active="all"
          onSelect={() => undefined}
          label="Standing costs"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Reference, description or payee',
            matched: filteredTemplates.length,
            total: templates.length,
          }}
        />
      )}

      {error ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {view === 'claims' ? (
        <>
          <DataTable
            columns={claimColumns}
            rows={pagedClaims.rows}
            rowKey={(expense) => expense.id}
            breakpoint="72rem"
            emptyCopy={
              isLoading
                ? 'Loading…'
                : seesEverything
                  ? 'No expenses filed yet. Add one the moment you have the receipt.'
                  : 'You have not filed an expense yet. Add one the moment you have the receipt.'
            }
            emptyAction={
              isLoading ? undefined : (
                <Button size="sm" onClick={() => setAdding('claims')}>
                  <Plus className="mr-1.5 size-4" />
                  Add expense
                </Button>
              )
            }
          />
          <TablePager
            paged={pagedClaims}
            noun="expenses"
            summary={
              model.filteredTotal(filteredClaims) > 0 ? (
                <span className="tabular-nums">{fmtDjf(model.filteredTotal(filteredClaims))} shown</span>
              ) : undefined
            }
          />
        </>
      ) : (
        <>
          <DataTable
            columns={templateColumns}
            rows={pagedTemplates.rows}
            rowKey={(template) => template.id}
            breakpoint="64rem"
            emptyCopy={
              templatesLoading
                ? 'Loading…'
                : 'Nothing recurring yet. Add the rent, the salaries and the premiums that come back every month.'
            }
            emptyAction={
              canManage && !templatesLoading ? (
                <Button size="sm" onClick={() => setAdding('recurring')}>
                  <Plus className="mr-1.5 size-4" />
                  Recurring cost
                </Button>
              ) : undefined
            }
          />
          <TablePager
            paged={pagedTemplates}
            noun="standing costs"
            summary={
              model.monthlyCommitment > 0 ? (
                <span className="tabular-nums">{compactDjf(model.monthlyCommitment)} a month</span>
              ) : undefined
            }
          />
        </>
      )}

      <AddExpenseDialog
        open={adding === 'claims'}
        onOpenChange={(open) => setAdding(open ? 'claims' : null)}
      />
      <AddRecurringExpenseDialog
        open={adding === 'recurring'}
        onOpenChange={(open) => setAdding(open ? 'recurring' : null)}
      />
      <RefuseClaimDialog expense={rejecting} onClose={() => setRejecting(null)} />
      {confirmDialog}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Refusing a claim
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Its own dialog rather than a `confirm`, because the reason is the point.
 *
 * A person whose fuel receipt came back refused cannot re-file it correctly
 * without being told what was wrong, and the server requires the sentence for
 * exactly that reason. A yes/no confirm could not carry one.
 */
function RefuseClaimDialog({ expense, onClose }: { expense: ExpenseRecord | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reject = useRejectExpense();

  function close() {
    setReason('');
    reject.reset();
    onClose();
  }

  return (
    <Dialog open={expense !== null} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader title="Refuse this claim">
          <p className="text-sm text-muted-foreground">
            {expense
              ? `${expense.number} · ${fmtDjf(fromMinorUnits(expense.amountMinorUnits, expense.currency))}`
              : ''}
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
          <Label htmlFor="refuse-reason">Why</Label>
          <Textarea
            id="refuse-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="No VAT number on the receipt — ask the station to reissue."
            textareaSize="sm"
          />
          {reject.isError ? (
            <p className="text-sm text-destructive">{(reject.error as Error).message}</p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border-subtle">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0 || reject.isPending}
            onClick={() =>
              expense &&
              reject.mutate({ id: expense.id, reason: reason.trim() }, { onSuccess: close })
            }
          >
            Refuse claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The figures
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Four tones, each naming what the money is doing — the same grammar the
 * Money page uses, so a finance figure reads the same wherever it appears.
 *
 *   `pending`  filed, waiting on somebody  — amber, it is a move
 *   `out`      approved and unpaid         — the accent kept for an obligation
 *   `spent`    money already gone          — brand teal, it reports
 *   `standing` what comes round anyway     — green, the settled number
 */
type CostTone = 'pending' | 'out' | 'spent' | 'standing';

const TONE_CHIP: Record<CostTone, IconChipTint> = {
  pending: 'amber',
  out: 'orange',
  spent: 'teal',
  standing: 'green',
};

const TONE_NOTE: Record<CostTone, string> = {
  pending: 'font-medium text-accent-subtle-foreground',
  out: 'text-muted-foreground',
  spent: 'text-muted-foreground',
  standing: 'text-muted-foreground',
};

function CostTile({
  label,
  value,
  note,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  note: string;
  icon: ComponentType<{ className?: string }>;
  tone: CostTone;
  loading: boolean;
}) {
  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <IconChip icon={icon} size={36} tint={TONE_CHIP[tone]} className="shrink-0" />
      </div>
      <div className="mt-auto">
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {fmtDjf(value)}
          </p>
        )}
        <p className={cn('mt-1.5 truncate text-xs', TONE_NOTE[tone])}>{note}</p>
      </div>
    </Card>
  );
}

const amountOf = (expense: ExpenseRecord) =>
  fromMinorUnits(expense.amountMinorUnits, expense.currency);

/**
 * The page's numbers, in one pass.
 *
 * `paidThisMonth` counts by when the money was SPENT rather than when the
 * claim was approved: a September fuel receipt filed in October is a September
 * cost, and counting it in October is how a monthly figure disagrees with the
 * bank statement it is checked against.
 */
function summarise(expenses: ExpenseRecord[], templates: RecurringExpenseRecord[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let awaiting = 0;
  let awaitingCount = 0;
  let approved = 0;
  let approvedCount = 0;
  let paidThisMonth = 0;

  const byCategory = new Map<string, number>();

  for (const expense of expenses) {
    const amount = amountOf(expense);
    if (expense.status === 'Submitted') {
      awaiting += amount;
      awaitingCount += 1;
    }
    if (expense.status === 'Approved') {
      approved += amount;
      approvedCount += 1;
    }
    if (expense.status === 'Paid' && new Date(expense.incurredAt).getTime() >= monthStart) {
      paidThisMonth += amount;
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + amount);
    }
  }

  const biggest = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  const active = templates.filter((template) => template.isActive);
  const monthlyCommitment = active.reduce(
    (sum, template) => sum + fromMinorUnits(template.monthlyMinorUnits, template.currency),
    0,
  );
  const dueCount = active.filter(
    (template) => new Date(template.nextDueAt).getTime() <= now.getTime(),
  ).length;

  return {
    awaiting,
    awaitingCount,
    approved,
    approvedCount,
    paidThisMonth,
    /* The category that took the most, so the tile's second line carries a
       fact the headline cannot rather than restating it. */
    topCategory: biggest
      ? `mostly ${categoryOption(biggest[0]).label.toLowerCase()}`
      : null,
    monthlyCommitment: Math.round(monthlyCommitment),
    activeTemplates: active.length,
    dueCount,
    filteredTotal: (rows: ExpenseRecord[]) => rows.reduce((sum, expense) => sum + amountOf(expense), 0),
  };
}
