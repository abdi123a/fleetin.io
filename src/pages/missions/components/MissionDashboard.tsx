import React from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import {
  Compass,
  Navigation,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Calendar,
  TrendingUp,
} from '@/design-system/icons';
import type { MissionKpiData, MonthlyTrendData } from '@/types/mission';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions } from '@/features/shipper-bi/charts/apexChartTheme';

interface MissionDashboardProps {
  kpis: MissionKpiData;
  monthlyTrends: MonthlyTrendData[];
  onStatClick?: (filterType: string) => void;
}

export const MissionDashboard: React.FC<MissionDashboardProps> = ({
  kpis,
  monthlyTrends,
  onStatClick,
}) => {
  const stats = [
    {
      id: 'total',
      label: 'Total Missions',
      value: kpis.totalMissions,
      change: '+14% vs last mo',
      icon: Compass,
      intent: 'border-primary/20 bg-primary/5 text-primary',
    },
    {
      id: 'active',
      label: 'Active Missions',
      value: kpis.activeMissions,
      change: '84 in transit',
      icon: Navigation,
      intent: 'border-info/20 bg-info-subtle text-info-subtle-foreground',
    },
    {
      id: 'completed',
      label: 'Completed Missions',
      value: kpis.completedMissions,
      change: '94.2% success rate',
      icon: CheckCircle2,
      intent: 'border-success/20 bg-success-subtle text-success-subtle-foreground',
    },
    {
      id: 'cancelled',
      label: 'Cancelled Missions',
      value: kpis.cancelledMissions,
      change: '2.5% rate',
      icon: XCircle,
      intent: 'border-border/20 bg-muted-foreground/5 text-muted-foreground',
    },
    {
      id: 'delayed',
      label: 'Delayed Missions',
      value: kpis.delayedMissions,
      change: 'Action required',
      icon: Clock,
      intent: 'border-warning/20 bg-warning-subtle text-warning-subtle-foreground',
    },
    {
      id: 'pending',
      label: 'Pending Assignments',
      value: kpis.pendingAssignments,
      change: 'Awaiting truck/driver',
      icon: UserCheck,
      intent: 'border-chart-5/20 bg-chart-5/5 text-chart-5',
    },
    {
      id: 'today',
      label: "Today's Missions",
      value: kpis.todayMissions,
      change: 'Scheduled today',
      icon: Calendar,
      intent: 'border-info/20 bg-info-subtle text-info-subtle-foreground',
    },
  ];

  const chartOptions: ApexOptions = baseChartOptions({
    chart: { type: 'area' },
    colors: ['var(--primary)', '#10b981'],
    stroke: { curve: 'smooth', width: [2.5, 2] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0,
        stops: [5, 95],
      },
    },
    xaxis: {
      categories: monthlyTrends.map((d) => d.month),
      labels: { style: { fontSize: '12px' } },
    },
    grid: {
      borderColor: 'var(--border)',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: { show: false },
    tooltip: {
      theme: undefined,
      style: { fontSize: '12px' },
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3.5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.id}
              type="button"
              onClick={() => onStatClick?.(stat.id)}
              className="text-left transition-transform hover:-translate-y-0.5 focus:outline-none cursor-pointer"
            >
              <Card className="p-4 rounded-lg border border-border/80 bg-card hover:border-primary/40 shadow-2xs h-full flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground line-clamp-1">
                    {stat.label}
                  </span>
                  <div className={`p-1.5 rounded-lg border ${stat.intent}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <div>
                  <div className="text-2xl font-black text-foreground tracking-tight">
                    {stat.value.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-medium text-muted-foreground mt-1 truncate">
                    {stat.change}
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Monthly Mission Volume & Performance Trend
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historical breakdown of total, completed, delayed, and cancelled missions by month.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Total Missions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-success" />
              <span className="text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-warning" />
              <span className="text-muted-foreground">Delayed</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ApexChart
            type="area"
            series={[
              { name: 'Total Missions', data: monthlyTrends.map((d) => d.total) },
              { name: 'Completed', data: monthlyTrends.map((d) => d.completed) },
            ]}
            options={chartOptions}
            height="100%"
          />
        </div>
      </Card>
    </div>
  );
};
