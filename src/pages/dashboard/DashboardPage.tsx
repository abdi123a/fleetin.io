import { useState } from 'react';
import {
  CheckCircle2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';

import { PageHeader } from '@/components';
import {
  Badge,
  BookingsTableCard,
  Button,
  CommandBarCard,
  DocumentsExpiringCard,
  ExpenseDonutCard,
  FleetUtilizationCard,
  PipelineFlowCard,
  ReceivablesAgingCard,
  RecentActivityCard,
  RevenueChartCard,
  StatCard,
  TopShippersCard,
} from '@/design-system';
import { kpis } from '@/data/dashboardData';
import { useAuthStore } from '@/stores';
import { useShipmentStore } from '@/stores/shipment.store';

/** Staggered entrance animation delay helper */
const rise = (i: number) => ({ ['--d' as string]: `${i * 70}ms` });

export function DashboardPage() {
  const { user } = useAuthStore();
  const openCreateModal = useShipmentStore((s) => s.openCreateModal);
  const [ready, setReady] = useState(true);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const toggleLoadingState = () => {
    setReady(false);
    setTimeout(() => setReady(true), 800);
  };

  const userName = user ? `${user.firstName} ${user.lastName}` : 'Super Admin';
  const userRole = user?.role || 'ADMIN';

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      {/* Success Notification Alert */}
      {successNotice && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-primary-subtle border border-primary/20 text-primary-subtle-foreground text-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="p-1 rounded-md hover:bg-primary/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title={`Welcome back, ${userName}`}
        description={`Logged in as ${userRole}. Fleet operations console, real-time analytics, and active shipment dispatches.`}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant="subtle" intent="accent" className="hidden sm:inline-flex px-3 py-1 font-semibold">
              Role: {userRole}
            </Badge>

            <Button
              variant="outline"
              size="sm"
              leadingIcon={<RefreshCw className={`w-3.5 h-3.5 ${!ready ? 'animate-spin' : ''}`} />}
              onClick={toggleLoadingState}
            >
              {ready ? 'Refresh Data' : 'Loading...'}
            </Button>

            {/* Quick Action: New Shipment Wizard */}
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="w-4 h-4" />}
              onClick={() => openCreateModal()}
            >
              New Shipment
            </Button>
          </div>
        }
      />

      {/* ── CARD 1: COMMAND BAR (HERO LIVE OPERATIONS CARD) ── */}
      <div className="animate-rise min-w-0" style={rise(0)}>
        <CommandBarCard ready={ready} />
      </div>

      {/* ── CARD 2: KPI STAT CARDS (6-CARD GRID WITH RECHARTS SPARKLINES) ── */}
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi, i) => (
          <div key={kpi.label} className="animate-rise min-w-0" style={rise(i + 1)}>
            <StatCard {...kpi} ready={ready} />
          </div>
        ))}
      </div>

      {/* ── CARD 3: PIPELINE FLOW CARD ── */}
      <div className="animate-rise min-w-0" style={rise(2)}>
        <PipelineFlowCard ready={ready} />
      </div>

      {/* ── CARDS 4 & 5: REVENUE TREND + EXPENSE DONUT ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="animate-rise min-w-0 xl:col-span-2" style={rise(3)}>
          <RevenueChartCard ready={ready} />
        </div>
        <div className="animate-rise min-w-0" style={rise(4)}>
          <ExpenseDonutCard ready={ready} />
        </div>
      </div>

      {/* ── CARD 6: BOOKINGS TABLE CARD ── */}
      <div className="animate-rise min-w-0" style={rise(5)}>
        <BookingsTableCard ready={ready} />
      </div>

      {/* ── CARDS 7, 8 & 9: DOCUMENTS EXPIRING + TOP SHIPPERS + RECEIVABLES AGING ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="animate-rise min-w-0" style={rise(6)}>
          <DocumentsExpiringCard ready={ready} />
        </div>
        <div className="animate-rise min-w-0" style={rise(7)}>
          <TopShippersCard ready={ready} />
        </div>
        <div className="animate-rise min-w-0 lg:col-span-2 xl:col-span-1" style={rise(8)}>
          <ReceivablesAgingCard ready={ready} />
        </div>
      </div>

      {/* ── CARDS 10 & 11: RECENT ACTIVITY + FLEET UTILIZATION GAUGE ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="animate-rise min-w-0 xl:col-span-2" style={rise(9)}>
          <RecentActivityCard ready={ready} />
        </div>
        <div className="animate-rise min-w-0" style={rise(10)}>
          <FleetUtilizationCard ready={ready} />
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
