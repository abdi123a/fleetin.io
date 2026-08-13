import type { ApexOptions } from 'apexcharts';
import { chartAxisTokens } from '@/design-system/tokens';
import { animationDuration, MARK, X_AXIS_HEIGHT } from './chartTheme';
import type { TooltipRow } from './ChartTooltip';

/**
 * Shared ApexCharts styling — premium interactions, no wash flash.
 *
 * Click/hover must never lighten the whole series. Feedback is a soft category
 * crosshair (bars) or a clean tooltip (all types). Tooltips use inline CSS
 * because Apex portals outside Tailwind's cascade.
 */

export function chartAnimSpeed(preferred = 700): number {
  return animationDuration(preferred);
}

/** Resolve a CSS color token to a concrete value Apex can paint reliably. */
export function resolveColor(token: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  if (!token.startsWith('var(')) return token;
  const probe = document.createElement('span');
  probe.style.color = token;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : fallback;
}

/** Quiet interaction states — no brighten, no flash on hover or click. */
export const quietStates: ApexOptions['states'] = {
  hover: { filter: { type: 'none' } },
  active: {
    allowMultipleDataPointsSelection: false,
    filter: { type: 'none' },
  },
};

/** Soft category wash for bar/column charts (not a brightness filter). */
export const categoryCrosshair: NonNullable<ApexOptions['xaxis']>['crosshairs'] = {
  show: true,
  width: 'tickWidth',
  position: 'back',
  opacity: 1,
  fill: {
    type: 'solid',
    color: 'var(--surface-sunken)',
  },
  stroke: { width: 0, color: 'transparent' },
};

export function baseChartOptions(overrides: ApexOptions = {}): ApexOptions {
  const speed = chartAnimSpeed();
  const {
    chart: chartOverride,
    grid: gridOverride,
    xaxis: xaxisOverride,
    yaxis: yaxisOverride,
    legend: legendOverride,
    stroke: strokeOverride,
    markers: markersOverride,
    dataLabels: dataLabelsOverride,
    tooltip: tooltipOverride,
    states: statesOverride,
    plotOptions: plotOptionsOverride,
    fill: fillOverride,
    ...rest
  } = overrides;

  return {
    chart: {
      fontFamily: 'inherit',
      background: 'transparent',
      foreColor: 'var(--muted-foreground)',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: speed > 0,
        speed,
        animateGradually: { enabled: true, delay: 60 },
        dynamicAnimation: { enabled: true, speed: 280 },
      },
      ...chartOverride,
      // Always win — callers must not re-enable selection flash.
      selection: { enabled: false },
    },
    grid: {
      borderColor: chartAxisTokens.grid,
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 8, right: 12, top: 12, bottom: 0 },
      ...gridOverride,
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: 'var(--muted-foreground)',
          fontSize: '11px',
          fontFamily: 'inherit',
          fontWeight: 600,
        },
      },
      tooltip: { enabled: false },
      ...xaxisOverride,
      crosshairs:
        xaxisOverride?.crosshairs === undefined ? categoryCrosshair : xaxisOverride.crosshairs,
    },
    yaxis: yaxisOverride ?? {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: 'var(--muted-foreground)',
          fontSize: '11px',
          fontFamily: 'inherit',
          fontWeight: 500,
        },
      },
    },
    legend: {
      fontSize: '11px',
      fontWeight: 600,
      labels: { colors: 'var(--muted-foreground)' },
      markers: { size: 5, strokeWidth: 0, offsetX: -2 },
      itemMargin: { horizontal: 12, vertical: 0 },
      ...legendOverride,
    },
    stroke: {
      width: MARK.lineWidth,
      lineCap: 'round',
      ...strokeOverride,
    },
    markers: {
      size: 0,
      strokeWidth: MARK.surfaceGap,
      strokeColors: 'var(--surface)',
      hover: { size: MARK.activeDotRadius, sizeOffset: 0 },
      ...markersOverride,
    },
    dataLabels: { enabled: false, ...dataLabelsOverride },
    fill: {
      opacity: 1,
      ...fillOverride,
    },
    // Omit when unset — ApexCharts Utils.extend copies `undefined` over defaults,
    // which drops plotOptions.line and crashes on config.plotOptions.line.isSlopeChart.
    ...(plotOptionsOverride ? { plotOptions: plotOptionsOverride } : {}),
    tooltip: {
      theme: undefined,
      shared: true,
      intersect: false,
      followCursor: false,
      style: { fontSize: '12px', fontFamily: 'inherit' },
      fillSeriesColor: false,
      ...tooltipOverride,
      onDatasetHover: { highlightDataSeries: false },
    },
    states: {
      ...quietStates,
      ...statesOverride,
      hover: { filter: { type: 'none' } },
      active: {
        allowMultipleDataPointsSelection: false,
        filter: { type: 'none' },
      },
    },
    ...rest,
  };
}

/**
 * Professional tooltip card — inline CSS only.
 * Apex mounts this inside the chart wrap (not a body portal), so Tailwind
 * utilities often miss; keep styles inline. Parent hosts must stay
 * overflow-visible so the card is not clipped by tabs/card edges.
 */
export function buildTooltipHtml(
  title: string | undefined,
  rows: TooltipRow[],
  footer?: string,
): string {
  if (rows.length === 0) return '';

  const titleHtml = title
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:var(--foreground);letter-spacing:-0.01em">${escapeHtml(title)}</p>`
    : '';

  const rowsHtml = rows
    .map((row) => {
      const swatch = row.color
        ? `<span style="width:8px;height:8px;border-radius:999px;background:${row.color};flex-shrink:0"></span>`
        : '';
      return `<li style="display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.25;margin:0">
        ${swatch}
        <span style="flex:1;color:var(--muted-foreground);font-weight:500">${escapeHtml(String(row.label))}</span>
        <span style="font-weight:700;font-variant-numeric:tabular-nums;color:var(--foreground)">${escapeHtml(String(row.value))}</span>
      </li>`;
    })
    .join('');

  const footerHtml = footer
    ? `<p style="margin:8px 0 0;padding-top:8px;border-top:1px solid var(--border-subtle);font-size:11px;color:var(--muted-foreground)">${escapeHtml(footer)}</p>`
    : '';

  return `<div style="
    min-width:168px;
    padding:10px 12px;
    border-radius:12px;
    border:1px solid var(--border);
    background:var(--surface-raised, var(--card, #fff));
    box-shadow:0 10px 28px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06);
    pointer-events:none;
  ">
    ${titleHtml}
    <ul style="display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none">${rowsHtml}</ul>
    ${footerHtml}
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function sparklineOptions(color: string, overrides: ApexOptions = {}): ApexOptions {
  return baseChartOptions({
    ...overrides,
    chart: {
      type: 'area',
      sparkline: { enabled: true },
      ...overrides.chart,
      selection: { enabled: false },
    },
    colors: [color],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: MARK.areaOpacity * 3,
        opacityTo: 0,
        stops: [0, 100],
      },
      ...overrides.fill,
    },
    stroke: { curve: 'smooth', width: MARK.lineWidth, ...overrides.stroke },
    xaxis: { ...overrides.xaxis, crosshairs: { show: false } },
    states: quietStates,
  });
}

export function donutOptions(
  colors: string[],
  overrides: ApexOptions = {},
): ApexOptions {
  const pieOverride = overrides.plotOptions?.pie;

  return baseChartOptions({
    ...overrides,
    chart: {
      type: 'donut',
      offsetY: 0,
      parentHeightOffset: 0,
      ...overrides.chart,
      selection: { enabled: false },
    },
    colors,
    plotOptions: {
      ...overrides.plotOptions,
      pie: {
        startAngle: 90,
        endAngle: -270,
        ...pieOverride,
        expandOnClick: false,
        donut: {
          size: '68%',
          ...pieOverride?.donut,
        },
      },
    },
    stroke: {
      show: true,
      width: 3,
      colors: ['var(--surface)'],
      ...overrides.stroke,
    },
    dataLabels: { enabled: false, ...overrides.dataLabels },
    legend: { show: false, ...overrides.legend },
    xaxis: { ...overrides.xaxis, crosshairs: { show: false } },
    states: quietStates,
    tooltip: {
      shared: false,
      intersect: true,
      fillSeriesColor: false,
      ...overrides.tooltip,
      onDatasetHover: { highlightDataSeries: false },
    },
  });
}

export { X_AXIS_HEIGHT, MARK };
