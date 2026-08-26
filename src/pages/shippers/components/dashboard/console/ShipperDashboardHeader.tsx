import { Download, ExternalLink, Sun, Moon, Sunrise, Sparkles } from 'lucide-react';
import { TimeframePicker } from '../TimeframePicker';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { IconChip } from '@/design-system';

export interface ShipperDashboardHeaderProps {
  userName?: string;
  greeting?: string;
  pendingCount?: number;
  preset: DatePreset;
  from: string;
  to: string;
  onTimeframeChange: (preset: DatePreset) => void;
  onCustomRangeChange?: (from: string, to: string) => void;
  onPendingClick?: () => void;
  onExportCsv?: () => void;
}

export function ShipperDashboardHeader({
  userName = 'Mohamed',
  greeting = 'Good Evening!',
  pendingCount = 8,
  preset,
  from,
  to,
  onTimeframeChange,
  onCustomRangeChange,
  onPendingClick,
  onExportCsv,
}: ShipperDashboardHeaderProps) {
  // Determine time-of-day icon based on greeting string. Unstyled — IconChip
  // owns size and colour (a solid disc, glyph in `-foreground`), so a
  // hardcoded size/tint here would just fight its own chip.
  const getGreetingIcon = () => {
    const lower = greeting.toLowerCase();
    if (lower.includes('morning')) return <Sunrise />;
    if (lower.includes('afternoon')) return <Sun />;
    if (lower.includes('evening') || lower.includes('night')) return <Moon />;
    return <Sparkles />;
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      {/* Left Greeting & Subheading Header */}
      <div className="flex flex-col gap-1.5">
        {/* Smaller Name & Welcome Eyebrow */}
        <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <span>Hi <span className="font-semibold text-foreground">{userName}</span>, welcome back!</span> 👋
        </div>

        {/* Big Prominent Greeting Headline */}
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl flex items-center gap-3">
          <span>{greeting}</span>
          <IconChip>{getGreetingIcon()}</IconChip>
        </h1>

        {/* Subtitle & Status Row */}
        {pendingCount > 0 && (
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            {/* 8 Pending Shipment Notification Pill (RED style with pulsing dot) */}
            <button
              type="button"
              onClick={onPendingClick}
              className="group inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive-subtle px-3 py-1.5 text-xs font-bold text-destructive-subtle-foreground hover:bg-destructive/20 hover:border-destructive/60 transition cursor-pointer shadow-2xs shrink-0 active:scale-95"
              title="View pending empty returns"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
              </span>
              <span className="tracking-tight">{pendingCount} Pending Empty Return</span>
              <ExternalLink className="h-3 w-3 text-destructive-subtle-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </button>
          </div>
        )}
      </div>

      {/* Right Timeframe & Export Controls */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
        {/* Main Timeframe Selector */}
        <TimeframePicker
          preset={preset}
          from={from}
          to={to}
          onChange={onTimeframeChange}
          onCustomChange={onCustomRangeChange}
        />

        {/* Export CSV Button */}
        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs hover:bg-surface-sunken transition-colors cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Export CSV</span>
        </button>
      </div>
    </div>
  );
}

export default ShipperDashboardHeader;
