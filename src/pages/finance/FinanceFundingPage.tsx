import { SheetHeading } from '@/components/common';
import { useState, type FormEvent } from 'react';

import { ChevronDown, ChevronRight, Landmark, Plus, TrendingUp } from '@/design-system/icons';
import { Button, Input, Select, Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';
import { formatMoneyMinorUnits } from '@/lib/finance';
import { useBankAccounts } from '@/features/bank-accounts';
import {
  useCreateCreditFacility,
  useCreateDrawdown,
  useCreditFacilities,
  useDrawdowns,
  useRepayDrawdown,
  type CreateCreditFacilityPayload,
  type CreditFacilityRecord,
} from '@/features/finance';

import { DataTable, EmptyState, IconChip, PageHead, Panel, Pill, StatCard, Td, Th } from './components/kit';

/**
 * Credit facilities and their drawdowns — standalone finance-desk objects,
 * never linked to a specific shipment or project (no real per-shipment
 * funding assignment exists; see Phase 4a's own scoping note on this).
 */

const CURRENCY_OPTIONS = [
  { value: 'DJF', label: 'DJF — Djiboutian Franc' },
  { value: 'USD', label: 'USD — US Dollar' },
];

const EMPTY_FORM: CreateCreditFacilityPayload = {
  bankName: '',
  bankAccountId: '',
  limitMinorUnits: 0,
  currency: 'DJF',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: undefined,
  isRevolving: true,
  feeDescription: '',
};

export function FinanceFundingPage() {
  const { data: facilities = [], isLoading } = useCreditFacilities();
  const { data: drawdowns = [] } = useDrawdowns();
  const { data: bankAccounts = [] } = useBankAccounts();
  const createFacility = useCreateCreditFacility();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateCreditFacilityPayload>(EMPTY_FORM);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalLimit = facilities.reduce((sum, f) => sum + Number(f.limitMinorUnits), 0);
  const totalDrawn = drawdowns.reduce((sum, d) => sum + Number(d.amountMinorUnits) - Number(d.repaidMinorUnits), 0);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.bankName || !form.bankAccountId || !form.limitMinorUnits) return;
    await createFacility.mutateAsync({ ...form, endDate: form.endDate || undefined, feeDescription: form.feeDescription || undefined });
    setForm(EMPTY_FORM);
    setIsCreateOpen(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Funding"
        subtitle="Facilities and the drawdowns against them"
        actions={
          <Button
            onClick={() => setIsCreateOpen(true)}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
          >
            New Facility
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Landmark} tint="teal" label="Facilities" value={String(facilities.length)} hint={facilities.length === 0 ? 'None registered yet' : `${drawdowns.length} drawdown${drawdowns.length === 1 ? '' : 's'}`} />
        <StatCard icon={TrendingUp} tint="orange" label="Drawn" value={facilities[0] ? formatMoneyMinorUnits(totalDrawn, facilities[0].currency) : '—'} hint="Across all facilities" />
        <StatCard
          icon={Landmark}
          tint="neutral"
          label="Total limit"
          value={facilities[0] ? formatMoneyMinorUnits(totalLimit, facilities[0].currency) : '—'}
          hint={
            facilities[0]
              ? `Combined ceiling · ${formatMoneyMinorUnits(totalLimit - totalDrawn, facilities[0].currency)} headroom left`
              : 'Combined ceiling'
          }
        />
      </div>

      <Panel title="Facilities" subtitle="Select a facility to see its drawdowns" padded={false}>
        {isLoading ? (
          <div className="px-5 py-6">
            <EmptyState message="Loading facilities…" />
          </div>
        ) : facilities.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState message="No facilities yet." />
          </div>
        ) : (
          <DataTable minWidth={860}>
            <thead>
              <tr>
                <Th />
                <Th>Facility</Th>
                <Th>Bank</Th>
                <Th align="right">Limit</Th>
                <Th align="right">Drawn</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((facility) => {
                const facilityDrawdowns = drawdowns.filter((d) => d.facilityId === facility.id);
                const drawn = facilityDrawdowns.reduce((sum, d) => sum + Number(d.amountMinorUnits) - Number(d.repaidMinorUnits), 0);
                const isOpen = expanded === facility.id;
                return (
                  <ExpandableFacilityRows
                    key={facility.id}
                    facility={facility}
                    drawn={drawn}
                    drawdowns={facilityDrawdowns}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : facility.id)}
                  />
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md">
          <SheetHeading
            titleComponent={SheetTitle}
            descriptionComponent={SheetDescription}
            title={<>
              <Landmark className="h-5 w-5 text-primary" /> New Facility
            </>}
            description="A revolving line or fixed facility to draw from before a shipper settles."
          />

          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-foreground block">Bank Name *</label>
                  <Input required value={form.bankName} onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))} placeholder="e.g. CAC Bank" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-foreground block">Disburses into *</label>
                  <Select
                    value={form.bankAccountId}
                    options={[
                      { value: '', label: bankAccounts.length === 0 ? 'No bank accounts registered' : 'Select an account…' },
                      ...bankAccounts.map((a) => ({ value: a.id, label: `${a.bankName} · ${a.accountNumber.slice(-4)}` })),
                    ]}
                    onChange={(e) => setForm((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Limit *</label>
                    <Input type="number" min={0} required value={form.limitMinorUnits || ''} onChange={(e) => setForm((prev) => ({ ...prev, limitMinorUnits: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Currency *</label>
                    <Select value={form.currency} options={CURRENCY_OPTIONS} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Start date</label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">End date</label>
                    <Input type="date" value={form.endDate ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value || undefined }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-foreground block">Fee description</label>
                  <Input value={form.feeDescription ?? ''} onChange={(e) => setForm((prev) => ({ ...prev, feeDescription: e.target.value }))} placeholder="Optional" />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => { setIsCreateOpen(false); setForm(EMPTY_FORM); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createFacility.isPending} className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground">
                {createFacility.isPending ? 'Creating…' : 'Create Facility'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExpandableFacilityRows({
  facility,
  drawn,
  drawdowns,
  isOpen,
  onToggle,
}: {
  facility: CreditFacilityRecord;
  drawn: number;
  drawdowns: ReturnType<typeof useDrawdowns>['data'];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const list = drawdowns ?? [];
  const [newAmount, setNewAmount] = useState('');
  const [newDays, setNewDays] = useState('30');
  const [repayingId, setRepayingId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const createDrawdown = useCreateDrawdown();
  const repayDrawdown = useRepayDrawdown();

  const handleDraw = async () => {
    if (!newAmount.trim()) return;
    await createDrawdown.mutateAsync({ facilityId: facility.id, amountMinorUnits: Number(newAmount), daysUntilDue: Number(newDays) || 30 });
    setNewAmount('');
  };

  const handleRepay = async (id: string) => {
    if (!repayAmount.trim()) return;
    await repayDrawdown.mutateAsync({ id, payload: { amountMinorUnits: Number(repayAmount) }, facilityId: facility.id });
    setRepayingId(null);
    setRepayAmount('');
  };

  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors hover:bg-surface-sunken/60">
        <Td>{isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}</Td>
        <Td>
          <span className="flex items-center gap-2.5">
            <IconChip icon={Landmark} size={36} tint="teal" />
            <span className="flex flex-col">
              <span className="text-sm font-bold text-foreground">{facility.facilityNumber}</span>
              {facility.isRevolving ? <Pill tone="teal">Revolving</Pill> : null}
            </span>
          </span>
        </Td>
        <Td>
          <span className="text-sm font-semibold text-foreground">{facility.bankName}</span>
        </Td>
        <Td align="right">
          <span className="font-mono text-sm font-bold text-foreground">{formatMoneyMinorUnits(facility.limitMinorUnits, facility.currency)}</span>
        </Td>
        <Td align="right">
          <span className="font-mono text-sm font-bold text-foreground">{formatMoneyMinorUnits(drawn, facility.currency)}</span>
        </Td>
        <Td>
          <Pill tone={facility.status === 'ACTIVE' ? 'teal' : 'neutral'}>{facility.status}</Pill>
        </Td>
      </tr>
      {isOpen ? (
        <tr>
          <Td colSpan={6} className="bg-surface-sunken/40">
            <div className="flex flex-col gap-3 py-2">
              {list.length === 0 ? (
                <p className="text-xs font-semibold text-muted-foreground">No drawdowns on this facility yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {list.map((d) => {
                    const outstanding = Number(d.amountMinorUnits) - Number(d.repaidMinorUnits);
                    return (
                      <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
                        <span className="font-mono text-xs font-bold text-foreground">{d.number}</span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {formatMoneyMinorUnits(d.amountMinorUnits, d.currency)} drawn · {formatMoneyMinorUnits(outstanding, d.currency)} outstanding
                        </span>
                        <Pill tone={d.status === 'Closed' ? 'teal' : 'neutral'}>{d.status}</Pill>
                        {outstanding > 0 ? (
                          repayingId === d.id ? (
                            <span className="ml-auto flex items-center gap-2">
                              <input
                                type="number"
                                value={repayAmount}
                                onChange={(e) => setRepayAmount(e.target.value)}
                                placeholder="Amount"
                                className="w-28 rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold outline-none focus:border-primary"
                              />
                              <button type="button" onClick={() => handleRepay(d.id)} disabled={repayDrawdown.isPending} className="rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                                Confirm
                              </button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setRepayingId(d.id)} className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs font-bold text-foreground hover:bg-surface-sunken">
                              Repay
                            </button>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="Amount to draw"
                  className="w-40 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary"
                />
                <input
                  type="number"
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  placeholder="Days until due"
                  className="w-32 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleDraw}
                  disabled={createDrawdown.isPending || !newAmount.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {createDrawdown.isPending ? 'Drawing…' : 'New Drawdown'}
                </button>
              </div>
            </div>
          </Td>
        </tr>
      ) : null}
    </>
  );
}

export default FinanceFundingPage;
