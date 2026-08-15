import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { ROUTES } from '@/config/routes';
import { useBankAccounts } from '@/features/bank-accounts/api/queries';
import { useDrivers } from '@/features/drivers/api/queries';
import { useAvailableEmpties, useCycles, useOpenFullLoads } from '@/features/empty-returns/api/queries';
import { bookingToFullLoadMission, cycleToRow, emptyBookingToRow } from '@/features/empty-returns/mappers';
import {
  useAllInvoices,
  useAllPaymentOrders,
  useCreditFacilities,
  useDrawdowns,
  useLedgerEntries,
  useOpenHolds,
} from '@/features/finance';
import { useHrDashboard } from '@/features/hr/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useSettings } from '@/features/settings/api/queries';
import { useAllShipmentsRaw } from '@/features/shipments/api/queries';
import { useShippers } from '@/features/shippers/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';
import { useAuthStore } from '@/stores';

import {
  AdminConsoleHeader,
  AdminKpiTiles,
  AttentionQueueCard,
  CommissionCard,
  ConsoleTabs,
  EmptyReturnCard,
  FleetCard,
  LedgerFeedCard,
  MoneyFlowCard,
  NetworkCard,
  PayrollCard,
  ReceivablesCard,
  ShipmentFlowCard,
  VolumeCard,
  WorkforceCard,
  type ConsoleTab,
} from './components';
import { buildAdminConsoleModel, type AttentionItem } from './model';

/**
 * The administrator's console.
 *
 * It replaces the old showcase dashboard entirely — that screen was eleven
 * mock cards from `@/data/dashboardData` arranged by what looked good, and not
 * one of its figures had a source. Every number here reads from the backend
 * through each module's own query hooks, and every derivation happens once, in
 * `buildAdminConsoleModel`, so a tile and the chart under it cannot disagree.
 *
 * Structure, and why it is tabbed rather than stacked: five modules on one
 * scroll produced a scrapbook — money beside containers beside payroll, none
 * of them finishing a thought. Each subject now owns a tab and every panel in
 * that tab answers the same question. Overview is the exception by design: the
 * six tiles, the platform's volume and money trend, and the full decision
 * queue, so somebody who opens no other tab has still seen everything urgent.
 *
 * The visual language is the shipper and transporter consoles', not this
 * page's own: the same tile fills, the same `ConsolePanel` frame, meters,
 * legends and status chips, and the same ApexCharts theming the BI modules
 * use. Colour discipline is theirs too — teal reports, orange asks, and red is
 * reserved for a rule that is already broken.
 *
 * Bank balances are deliberately absent. A balance is something you go to the
 * Accounts screen to read against a statement; what belongs here is capacity
 * and commission — what the platform earned and what it can still spend.
 */

type TabKey = 'overview' | 'operations' | 'money' | 'people' | 'network';

const TAB_KEYS: TabKey[] = ['overview', 'operations', 'money', 'people', 'network'];

/** Which queue items belong to which section. */
const TAB_MODULES: Record<Exclude<TabKey, 'overview'>, AttentionItem['module'][]> = {
  operations: ['Shipments', 'Empty returns'],
  money: ['Finance'],
  people: ['People'],
  network: ['Fleet'],
};

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'overview';

  const setTab = (next: TabKey) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'overview') params.delete('tab');
        else params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  };

  /*
   * One clock for the whole screen. Deadlines and expiries are read against
   * it, so two panels can never disagree about what "now" is mid-render — and
   * the minute tick keeps a risk board honest without a manual refresh.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // The three lists the money/volume model sums are fetched whole — every
  // page, not one capped one — because a silent first-page-only total is a
  // wrong number, not a slow one. The smaller lookups below stay single-page.
  const shipmentsQuery = useAllShipmentsRaw({ limit: 500 });
  const cyclesQuery = useCycles();
  const emptiesQuery = useAvailableEmpties();
  const fullLoadsQuery = useOpenFullLoads();
  const invoicesQuery = useAllInvoices({ limit: 500 });
  const paidOrdersQuery = useAllPaymentOrders({ status: 'Paid', limit: 500 });
  const holdsQuery = useOpenHolds();
  const accountsQuery = useBankAccounts();
  const facilitiesQuery = useCreditFacilities();
  const drawdownsQuery = useDrawdowns();
  const shippersQuery = useShippers({ limit: 200 });
  const partnersQuery = usePartners({ limit: 200 });
  const vehiclesQuery = useVehicles({ limit: 500 });
  const driversQuery = useDrivers({ limit: 500 });
  const hrQuery = useHrDashboard();
  const ledgerQuery = useLedgerEntries({ limit: 40 });
  const settingsQuery = useSettings();

  const loading =
    shipmentsQuery.isFetching ||
    cyclesQuery.isFetching ||
    invoicesQuery.isFetching ||
    hrQuery.isFetching;

  /*
   * Empty Returns keeps its own view model — a cycle and an unmatched empty
   * are two different backend shapes that the module's mappers already fold
   * into one row type. Rebuilding that here would be a second, divergent
   * definition of "a container that is still out".
   */
  const returnRecords = useMemo(
    () => [
      ...(cyclesQuery.data ?? []).map((cycle) => cycleToRow(cycle, now)),
      ...(emptiesQuery.data ?? []).map((booking) => emptyBookingToRow(booking, now)),
    ],
    [cyclesQuery.data, emptiesQuery.data, now],
  );

  const fullLoads = useMemo(
    () => (fullLoadsQuery.data ?? []).map(bookingToFullLoadMission),
    [fullLoadsQuery.data],
  );

  const model = useMemo(
    () =>
      buildAdminConsoleModel({
        shipments: shipmentsQuery.data ?? [],
        returnRecords,
        fullLoads,
        invoices: invoicesQuery.data ?? [],
        paidOrders: paidOrdersQuery.data ?? [],
        holds: holdsQuery.data ?? [],
        accounts: accountsQuery.data ?? [],
        facilities: facilitiesQuery.data ?? [],
        drawdowns: drawdownsQuery.data ?? [],
        shippers: shippersQuery.data?.items ?? [],
        partners: partnersQuery.data?.items ?? [],
        vehicles: vehiclesQuery.data?.items ?? [],
        drivers: driversQuery.data?.items ?? [],
        hr: hrQuery.data,
        ledger: ledgerQuery.data?.items ?? [],
        commissionPct: settingsQuery.data?.fleetinCommissionPct ?? 0,
        routes: {
          shipments: ROUTES.shipmentsList,
          emptyReturns: ROUTES.emptyReturns,
          emptyReturnCycles: ROUTES.emptyReturnsCycles,
          finance: ROUTES.finance,
          financeInvoices: ROUTES.financeInvoices,
          hr: ROUTES.hr,
          hrEmployees: ROUTES.hrEmployees,
          vehicles: ROUTES.vehicles,
        },
        now,
      }),
    [
      shipmentsQuery.data,
      returnRecords,
      fullLoads,
      invoicesQuery.data,
      paidOrdersQuery.data,
      holdsQuery.data,
      accountsQuery.data,
      facilitiesQuery.data,
      drawdownsQuery.data,
      shippersQuery.data,
      partnersQuery.data,
      vehiclesQuery.data,
      driversQuery.data,
      hrQuery.data,
      ledgerQuery.data,
      settingsQuery.data,
      now,
    ],
  );

  const sliceFor = (key: Exclude<TabKey, 'overview'>) =>
    model.attention.filter((item) => TAB_MODULES[key].includes(item.module));

  const tabs: ConsoleTab<TabKey>[] = useMemo(() => {
    const badge = (items: AttentionItem[]) => ({
      alerts: items.length,
      breached: items.some((item) => item.severity === 'breach'),
    });
    const slice = (key: Exclude<TabKey, 'overview'>) =>
      model.attention.filter((item) => TAB_MODULES[key].includes(item.module));

    return [
      { key: 'overview', label: 'Overview', ...badge(model.attention) },
      { key: 'operations', label: 'Operations', ...badge(slice('operations')) },
      { key: 'money', label: 'Money', ...badge(slice('money')) },
      { key: 'people', label: 'People', ...badge(slice('people')) },
      { key: 'network', label: 'Network & fleet', ...badge(slice('network')) },
    ];
  }, [model.attention]);

  const userName = user ? `${user.firstName} ${user.lastName}`.trim() || 'Administrator' : 'Administrator';
  const userRole = user?.role ?? 'ADMIN';

  const breaches = model.attention
    .filter((item) => item.severity === 'breach')
    .reduce((sum, item) => sum + item.count, 0);
  const asks = model.attention
    .filter((item) => item.severity === 'ask')
    .reduce((sum, item) => sum + item.count, 0);

  const refresh = () => {
    setNow(Date.now());
    void queryClient.invalidateQueries();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-10 pt-1 sm:px-6">
      <AdminConsoleHeader
        userName={userName}
        userRole={userRole}
        now={now}
        loading={loading}
        breaches={breaches}
        asks={asks}
        onRefresh={refresh}
      />

      <ConsoleTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' ? (
        <>
          <AdminKpiTiles model={model} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <MoneyFlowCard movement={model.movement} />
            <VolumeCard movement={model.movement} />
          </div>
          <AttentionQueueCard items={model.attention} />
        </>
      ) : null}

      {tab === 'operations' ? (
        <>
          <ShipmentFlowCard operations={model.operations} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <EmptyReturnCard returns={model.returns} />
            <VolumeCard movement={model.movement} />
          </div>
          <AttentionQueueCard
            items={sliceFor('operations')}
            title="Operations decisions"
            clearMessage="Nothing on the road or in a depot needs a decision"
            emptyNote="No breached container deadline and no shipment stuck waiting on the desk."
          />
        </>
      ) : null}

      {tab === 'money' ? (
        <>
          <MoneyFlowCard movement={model.movement} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CommissionCard money={model.money} />
            <ReceivablesCard money={model.money} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <LedgerFeedCard entries={model.activity} />
            <AttentionQueueCard
              items={sliceFor('money')}
              title="Money decisions"
              clearMessage="Nothing in the book needs a decision"
              emptyNote="No overdue invoice, no open hold and no drawdown past its due date."
            />
          </div>
        </>
      ) : null}

      {tab === 'people' ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <PayrollCard workforce={model.workforce} />
            <WorkforceCard workforce={model.workforce} />
          </div>
          <AttentionQueueCard
            items={sliceFor('people')}
            title="People decisions"
            clearMessage="HR has nothing outstanding"
            emptyNote="No leave request waiting and no employee document expiring inside 30 days."
          />
        </>
      ) : null}

      {tab === 'network' ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <NetworkCard network={model.network} />
            <FleetCard fleet={model.fleet} />
          </div>
          <AttentionQueueCard
            items={sliceFor('network')}
            title="Fleet decisions"
            clearMessage="Every truck and driver is road-legal"
            emptyNote="No expired paper and nothing expiring inside 30 days across the partner fleet."
          />
        </>
      ) : null}
    </div>
  );
}

export default DashboardPage;
