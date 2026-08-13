import { useState } from 'react';
import {
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
  StatisticCard,
  TopShippersCard,
} from '@/design-system';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseGrid,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
  type PropDefinition,
} from '@/design-system/showcase';
import {
  ConsolePanel,
  InsightNote,
  Legend,
  Meter,
  PanelLink,
  PanelOutlineLink,
  PartyBadge,
  PillTabs,
  SectionLabel,
  SegmentBar,
  StatBox,
  StatusChip,
  UnderlineTabs,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import { kpis } from '@/data/dashboardData';
import { CheckCircle2, Clock, Gauge, RefreshCw, TimerReset } from 'lucide-react';

/** Staggered entrance delay, copied from DashboardPage.tsx:30 — a fixed 70ms step. */
const rise = (i: number) => ({ ['--d' as string]: `${i * 70}ms` });

/** A minimal PipelineBookingItem set, enough to exercise the dynamic mode. */
const demoBookings = [
  {
    id: 'b-1',
    bookingNumber: 'FLT-24187',
    status: 'Dispatched',
    statusIntent: 'blue' as const,
    driverName: 'Ahmed Farah',
    vehicleNumber: 'DJ 4412 A',
  },
  {
    id: 'b-2',
    bookingNumber: 'FLT-24190',
    status: 'Free Zone Delivered',
    statusIntent: 'green' as const,
    driverName: 'Ismail Robleh',
    vehicleNumber: 'DJ 2208 C',
  },
  {
    id: 'b-3',
    bookingNumber: 'FLT-24193',
    status: 'Pending Empty Return',
    statusIntent: 'orange' as const,
    driverName: 'Warsama Guled',
    vehicleNumber: 'DJ 7761 B',
  },
];

const PIPELINE_PROPS: PropDefinition[] = [
  {
    name: 'ready',
    type: 'boolean',
    defaultValue: 'true',
    description:
      'False swaps the whole card for its skeleton. Nine of the eleven dashboard cards take this prop and render the same Skeleton from DashboardSkeleton.tsx.',
  },
  {
    name: 'bookings',
    type: 'T[] (T extends PipelineBookingItem)',
    description:
      'Supplying it switches the card from the built-in demo stages to counting real bookings per stage. Each item needs at least id, bookingNumber and status; status is matched against the six stage names by substring.',
  },
  {
    name: 'onBookingClick',
    type: '(booking: T) => void',
    description:
      'Declared on the props type and passed by ShipmentOverviewPage, but the component signature never destructures it, so today the handler is accepted and dropped. Documented here because the app passes it, not because it works.',
  },
];

const CONSOLE_PANEL_PROPS: PropDefinition[] = [
  { name: 'title', type: 'string', required: true, description: 'The question the panel answers.' },
  {
    name: 'subtitle',
    type: 'ReactNode',
    description: 'One clause under the title stating the scope of the figures.',
  },
  {
    name: 'action',
    type: 'ReactNode',
    description:
      'Sits opposite the title. In practice this is a PanelLink, a PanelOutlineLink, a Legend or a StatusChip.',
  },
  {
    name: 'band',
    type: 'ReactNode',
    description:
      'Rendered below the header, still inside the header padding — where tabs and toggles go so they read as part of the header rather than the body.',
  },
  {
    name: 'footer',
    type: 'ReactNode',
    description:
      'Sits under a hairline at the foot of the panel and carries the conclusion. This is where a console card says what its numbers mean.',
  },
  {
    name: 'bodyClassName',
    type: 'string',
    description:
      'Overrides the body padding. Panels with edge-to-edge tables pass px-0 pt-0 pb-0 and re-apply padding per row.',
  },
  { name: 'className', type: 'string', description: 'Applied to the Card frame.' },
  { name: 'children', type: 'ReactNode', required: true, description: 'The panel body.' },
];

const KIT_EXPORTS: { name: string; note: string }[] = [
  { name: 'PANEL_SURFACE', note: "The string 'shadow-card'. Every console panel carries it." },
  { name: 'ConsolePanel', note: 'The frame: header, optional band, body, optional footer.' },
  { name: 'SectionLabel', note: '10px all-caps rule that opens a block or heads a column.' },
  { name: 'PanelLink', note: 'Filled pill link in the header action slot.' },
  { name: 'PanelOutlineLink', note: 'Outlined variant, for a secondary destination.' },
  { name: 'Legend', note: 'Dot or square swatches naming the series in the panel below.' },
  { name: 'Meter', note: 'One track, clamped 0–1, with an optional benchmark tick.' },
  { name: 'SegmentBar', note: 'One row split into shares, each labelled in place.' },
  { name: 'InsightNote', note: 'The sentence that states what the panel means.' },
  { name: 'StatBox', note: 'A boxed figure with a label and a line of arithmetic.' },
  { name: 'UnderlineTabs', note: 'Tabs that slice the same chart.' },
  { name: 'PillTabs', note: 'Tabs that swap the whole table underneath.' },
  { name: 'StatusChip', note: 'Five tones, optional ping dot on critical and attention.' },
  { name: 'PartyBadge', note: 'Two-letter square naming who owns a row.' },
];

export function DashboardCardsSection() {
  const [ready, setReady] = useState(true);
  const [slice, setSlice] = useState<'week' | 'month'>('week');
  const [flow, setFlow] = useState<'import' | 'export'>('import');

  const toggleReady = () => {
    setReady(false);
    setTimeout(() => setReady(true), 800);
  };

  return (
    <ShowcaseSection
      id="dashboard-cards"
      index="12"
      title="Dashboard & Console"
      description="Two vocabularies build every dashboard in the product. The eleven Dashboard card primitives assemble one screen — /dashboard. Every other console (transporter, empty returns, shipper, finance) is assembled from the console panel kit and a four-tile KPI strip. Charts everywhere are ApexCharts; Recharts is not a dependency of this project."
    >
      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="01 · Dashboard card primitives"
        description="All eleven cards are rendered by src/pages/dashboard/DashboardPage.tsx, which is the only consumer of ten of them. Charted cards (StatCard, RevenueChartCard, ExpenseDonutCard) render through the ApexChart wrapper; FleetUtilizationCard's gauge is hand-drawn SVG, not a chart library."
        aside={
          <Button
            variant="outline"
            size="sm"
            leadingIcon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${!ready ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
            }
            onClick={toggleReady}
          >
            {ready ? 'Test loading skeletons' : 'Loading skeletons...'}
          </Button>
        }
      >
        <ShowcaseExample
          title="CommandBarCard"
          description="The full-width hero. It is the first card on the dashboard and the only one that spans the grid on its own."
          layout="bare"
        >
          <div className="animate-rise min-w-0" style={rise(0)}>
            <CommandBarCard ready={ready} />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="StatCard — the six-up strip"
          description="Rendered here at the xl:grid-cols-6 track the dashboard actually uses, because that is the width where the count-up value and the sparkline are closest to colliding. The kpis array holds exactly six entries; the page maps it unsliced."
          layout="bare"
        >
          <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map((kpi, i) => (
              <div key={kpi.label} className="animate-rise min-w-0" style={rise(i + 1)}>
                <StatCard {...kpi} ready={ready} />
              </div>
            ))}
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="PipelineFlowCard — demo mode"
          description="With no bookings prop the card draws the six lifecycle stages from its own fixed sample. This is what the dashboard renders."
          layout="bare"
        >
          <div className="animate-rise min-w-0" style={rise(2)}>
            <PipelineFlowCard ready={ready} />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="PipelineFlowCard — bookings mode"
          description="Passing bookings switches the card to counting real records per stage. ShipmentOverviewPage ships this mode; it is the only dashboard card with two app consumers, and half its surface area was previously undocumented."
          layout="bare"
        >
          <PipelineFlowCard bookings={demoBookings} />
        </ShowcaseExample>

        <div className="space-y-3">
          <h4 className="type-h4 text-foreground">PipelineFlowCard props</h4>
          <PropsTable props={PIPELINE_PROPS} />
        </div>

        <ShowcaseExample
          title="RevenueChartCard & ExpenseDonutCard"
          description="An Apex area chart with a summary strip, paired with an Apex donut. Both take only ready."
          layout="bare"
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="animate-rise min-w-0 xl:col-span-2" style={rise(3)}>
              <RevenueChartCard ready={ready} />
            </div>
            <div className="animate-rise min-w-0" style={rise(4)}>
              <ExpenseDonutCard ready={ready} />
            </div>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="BookingsTableCard"
          description="The dense operational table card: status pills, route indicators, row actions."
          layout="bare"
        >
          <div className="animate-rise min-w-0" style={rise(5)}>
            <BookingsTableCard ready={ready} />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="DocumentsExpiringCard, TopShippersCard & ReceivablesAgingCard"
          description="The three-up insight row. ReceivablesAgingCard takes the wide slot on large screens and the narrow one on extra-large, which is why it carries lg:col-span-2 xl:col-span-1 in both the app and here."
          layout="bare"
        >
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
        </ShowcaseExample>

        <ShowcaseExample
          title="RecentActivityCard & FleetUtilizationCard"
          description="The audit feed beside the utilization gauge. The gauge is an inline SVG arc computed in the component, so it costs nothing at runtime and themes through the same tokens as everything else."
          layout="bare"
        >
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="animate-rise min-w-0 xl:col-span-2" style={rise(9)}>
              <RecentActivityCard ready={ready} />
            </div>
            <div className="animate-rise min-w-0" style={rise(10)}>
              <FleetUtilizationCard ready={ready} />
            </div>
          </div>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">The entrance stagger</h4>
          <p className="type-body-sm mt-2 text-muted-foreground">
            Every card on the dashboard is wrapped in{' '}
            <code className="type-mono">animate-rise</code> with a{' '}
            <code className="type-mono">--d</code> custom property set to{' '}
            <code className="type-mono">i * 70ms</code>. The step is fixed at 70ms so a grid of
            eleven cards finishes settling inside a second; a larger step makes the page feel like
            it is loading twice, and a smaller one reads as no stagger at all. Each specimen above
            carries its real delay index, which is why they land in sequence on first paint.
          </p>
        </ShowcasePanel>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="02 · The console panel kit"
        description="Lives at src/pages/transporter-portal/components/dashboard/console/kit.tsx. Twenty-three console cards import it — seventeen in the transporter console and all six Empty Returns cards, which reach it by absolute path across a module boundary. That crossing is what makes it a design-system component in everything but location, and why it is documented here."
      >
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">Exports</h4>
          <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {KIT_EXPORTS.map((item) => (
              <div key={item.name} className="min-w-0">
                <dt className="type-mono text-foreground">{item.name}</dt>
                <dd className="type-body-xs mt-0.5 text-muted-foreground">{item.note}</dd>
              </div>
            ))}
          </dl>
        </ShowcasePanel>

        <ShowcaseExample
          title="ConsolePanel"
          description="Header, optional band, body, optional footer — and nothing else. The footer is the part that matters: a console card that reports a number without saying what it means is a card the reader learns to skip."
          layout="bare"
        >
          <ConsolePanel
            title="Detention & Empty Return Status"
            subtitle="Containers only — shipper-owned boxes on a detention clock"
            action={<PanelLink>View all</PanelLink>}
            band={
              <PillTabs
                className="mt-3"
                tabs={[
                  { key: 'import' as const, label: 'Import', count: 14 },
                  { key: 'export' as const, label: 'Export', count: 6 },
                ]}
                active={flow}
                onChange={setFlow}
              />
            }
            footer={
              <p className="type-body-xs text-muted-foreground">
                Showing the 3 most urgent of 20 open containers
              </p>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <PartyBadge initials="PT" tone="info" />
                <span className="type-body-sm min-w-0 flex-1 truncate text-foreground">
                  Port terminal — gate slot missed
                </span>
                <StatusChip tone="critical" pulse>
                  Overdue 2 days
                </StatusChip>
              </div>
              <div className="flex items-center gap-3">
                <PartyBadge initials="CU" tone="attention" />
                <span className="type-body-sm min-w-0 flex-1 truncate text-foreground">
                  Customs — inspection hold
                </span>
                <StatusChip tone="attention">Due today</StatusChip>
              </div>
              <div className="flex items-center gap-3">
                <PartyBadge initials="FL" />
                <span className="type-body-sm min-w-0 flex-1 truncate text-foreground">
                  Fleetin dispatch — driver assigned
                </span>
                <StatusChip tone="calm">3 days left</StatusChip>
              </div>
            </div>
          </ConsolePanel>
        </ShowcaseExample>

        <div className="space-y-3">
          <h4 className="type-h4 text-foreground">ConsolePanel props</h4>
          <PropsTable props={CONSOLE_PANEL_PROPS} />
        </div>

        <ShowcaseExample
          title="Meter, Legend and SegmentBar"
          description="Meter's benchmark tick is the reason most rows exist: a figure means nothing until the network comparison sits beside it. SegmentBar labels each share in place rather than in a key, so the reader never has to look away from the bar."
          layout="bare"
        >
          <ShowcasePanel>
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionLabel>Dwell at consignee site</SectionLabel>
                <Meter value={0.72} color="var(--primary)" benchmark={0.48} />
                <p className="type-body-xs text-muted-foreground">
                  The black tick is the network at 2.4 h. This carrier sits at 3.6 h.
                </p>
              </div>

              <div className="space-y-2">
                <SectionLabel>Moves this week</SectionLabel>
                <Legend
                  items={[
                    { label: 'Completed', color: 'var(--primary)' },
                    { label: 'Delayed', color: 'var(--accent-bold)' },
                  ]}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Cycle pipeline</SectionLabel>
                <SegmentBar
                  height={56}
                  segments={[
                    {
                      key: 'open',
                      label: 'Open',
                      value: 38,
                      color: 'var(--tile-teal)',
                      foreground: 'var(--tile-teal-foreground)',
                      caption: 'Open',
                    },
                    {
                      key: 'matchable',
                      label: 'Matchable',
                      value: 17,
                      color: 'var(--accent-bold)',
                      foreground: 'var(--accent-bold-foreground)',
                      caption: 'Matchable',
                    },
                    {
                      key: 'returned',
                      label: 'Returned',
                      value: 24,
                      color: 'var(--tile-sky)',
                      foreground: 'var(--tile-foreground)',
                      caption: 'Returned',
                    },
                  ]}
                />
              </div>
            </div>
          </ShowcasePanel>
        </ShowcaseExample>

        <ShowcaseExample
          title="StatBox and InsightNote"
          description="A boxed figure carries its own arithmetic underneath, because a percentage is a claim and the count behind it is the receipt. InsightNote's attention tone is the orange version, used when the conclusion is asking for something rather than reporting it."
          layout="bare"
        >
          <div className="space-y-4">
            <ShowcaseGrid minColumnWidth="14rem">
              <StatBox label="Paid" value="DJF 4.28 M" note="42 invoices settled" />
              <StatBox label="Awaiting" value="DJF 1.10 M" note="Within 48 h window" />
              <StatBox label="Overdue" value="DJF 340 K" tone="attention" note="9 past due" />
            </ShowcaseGrid>
            <InsightNote>
              Payment turnaround held at 41 hours this period, inside the 48-hour commitment.
            </InsightNote>
            <InsightNote tone="attention">
              Seventeen empties are cleared for matching and waiting on a decision. Every one paired
              before its cutoff is an empty leg that never gets driven.
            </InsightNote>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="UnderlineTabs and PillTabs"
          description="The two are not interchangeable. Underline tabs slice the same chart, so the frame stays and the data narrows. Pill tabs swap the whole table underneath, so the toggle reads as a switch between two views."
          layout="bare"
        >
          <div className="space-y-5">
            <UnderlineTabs
              tabs={[
                { key: 'week' as const, label: 'This week', count: 42 },
                { key: 'month' as const, label: 'This month', count: 186 },
              ]}
              active={slice}
              onChange={setSlice}
            />
            <PillTabs
              tabs={[
                { key: 'import' as const, label: 'Import', count: 14 },
                { key: 'export' as const, label: 'Export', count: 6 },
              ]}
              active={flow}
              onChange={setFlow}
            />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="StatusChip, PartyBadge and the panel links"
          description="StatusChip has five tones. Critical and attention accept a pulse dot; the ping is guarded with motion-reduce inside the component. PartyBadge is initials only, which is why it is reserved for roles — a named shipper or transporter shows its logo instead."
        >
          <StatusChip tone="critical" pulse>
            Overdue
          </StatusChip>
          <StatusChip tone="attention">Due today</StatusChip>
          <StatusChip tone="info">Scheduled</StatusChip>
          <StatusChip tone="calm">On track</StatusChip>
          <StatusChip tone="quiet">Closed</StatusChip>
          <PartyBadge initials="PT" tone="info" />
          <PartyBadge initials="CU" tone="attention" />
          <PartyBadge initials="FZ" tone="quiet" />
          <PanelLink>View all</PanelLink>
          <PanelOutlineLink>Cost detail →</PanelOutlineLink>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">PANEL_SURFACE, and the copy of it</h4>
          <p className="type-body-sm mt-2 text-muted-foreground">
            <code className="type-mono">PANEL_SURFACE</code> is the string{' '}
            <code className="type-mono">'shadow-card'</code> and nothing more. It exists as a named
            constant so that changing console elevation is one edit rather than twenty-three, and
            because <code className="type-mono">shadow-card</code> is the only elevation token with
            a genuinely different dark-mode definition — it adds a 1px border ring, since a shadow
            alone reads flat on a dark canvas. The panel frame carries the shadow and nothing else:
            no coloured rule along the top edge, which was tried and dropped because a stripe on
            every card is one more thing to look at and one less thing that means anything.
          </p>
          <p className="type-body-sm mt-3 text-muted-foreground">
            The same constant is declared a second time at{' '}
            <code className="type-mono">
              src/pages/shippers/components/dashboard/console/PanelHeader.tsx
            </code>{' '}
            with the identical value. Two declarations of one convention is how the convention
            eventually stops being one, so this is drift worth naming rather than tidying away
            quietly.
          </p>
        </ShowcasePanel>

        <GuidelineList
          guidelines={[
            {
              do: 'Give every panel a footer that states the conclusion its numbers support.',
              dont: 'Ship a panel that reports figures and leaves the reader to infer the point.',
            },
            {
              do: 'Use Meter with a benchmark whenever the row is a comparison.',
              dont: 'Draw a bare track and expect the reader to know what good looks like.',
            },
            {
              do: 'Keep to teal for what happened and orange for what wants attention.',
              dont: 'Reach for chart hues or success green as panel decoration.',
            },
            {
              do: 'Pick PillTabs when the tab swaps the content and UnderlineTabs when it filters it.',
              dont: 'Choose between them by which one looks better in the mock.',
            },
          ]}
        />
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="03 · The KPI tile strip"
        description="Every console opens with four filled tiles. StatisticCard's four solid variants carry them: teal, blue (which paints --tile-sky), peach and pink. The strip is the one place in the product where a card owns a hue outright."
      >
        <ShowcaseExample
          title="Four tiles, one row"
          description="The grid is grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 wherever this strip appears. Each tile states a label, one figure, its movement, and the arithmetic that produced it — 78% is a claim, 11 of 14 trucks rolling is the receipt."
          layout="bare"
        >
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatisticCard
              title="Fleet Utilization"
              value="78%"
              subtitle="11 of 14 trucks rolling"
              variant="teal"
              trend="up"
              percentage="+4.1%"
              icon={<Gauge className="h-5 w-5" />}
            />
            <StatisticCard
              title="Idle Fleet"
              value={26}
              subtitle="Vehicle-days idle"
              variant="blue"
              trend="down"
              percentage="-8%"
              icon={<Clock className="h-5 w-5" />}
            />
            <StatisticCard
              title="On-time Rate"
              value="91%"
              subtitle="163 of 179 moves on slot"
              variant="peach"
              trend="up"
              percentage="+2.4%"
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <StatisticCard
              title="Delay Rate"
              value="9%"
              subtitle="34 h lost this period"
              variant="pink"
              trend="down"
              percentage="-1.2%"
              icon={<TimerReset className="h-5 w-5" />}
            />
          </div>
        </ShowcaseExample>

        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">The tile owns the hue, the disc goes white</h4>
          <p className="type-body-sm mt-2 text-muted-foreground">
            IconChip is the one card mark in the system: a solid round disc, 44px with a 20px glyph
            or 36px with an 18px glyph, and no size in between. On a plain surface the disc takes
            the colour and the glyph goes light. On a filled tile that rule inverts, because the
            card already carries the hue — a second saturated disc on top of it reads as two marks
            competing. The inverted tints are{' '}
            <code className="type-mono">on-teal</code> for the teal tile and{' '}
            <code className="type-mono">on-light</code> for sky, peach and pink; both paint a white
            disc and tint the glyph to match the tile. StatisticCard applies the right one per
            variant, so passing an icon node is all a caller has to do.
          </p>
          <p className="type-body-sm mt-3 text-muted-foreground">
            The consoles that build their tiles from Card directly rather than StatisticCard — the
            transporter, shipper and Empty Returns KPI strips — set the same tints by hand from the
            IconChipTint union. Anything that renders a washed 10%-alpha tint, a rounded square, or
            a disc at 28px is a tile from before this rule and should be brought back in line.
          </p>
        </ShowcasePanel>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="04 · Charts"
        description="Every chart in the product is ApexCharts, rendered through one wrapper and one shared theme at src/features/shipper-bi/charts/. The folder name is historical — analytics, the transporter console, missions, shipments and the shipper console all render through it."
      >
        <ShowcasePanel>
          <h4 className="type-h4 text-foreground">How a chart gets its colours</h4>
          <p className="type-body-sm mt-2 text-muted-foreground">
            Series colour never comes from a literal. It comes from{' '}
            <code className="type-mono">chartTokens</code> for categorical series, assigned by
            position rather than rank so that filtering one series out never repaints the survivors
            — a reader who learned that a carrier is cyan must not be quietly told otherwise. Past
            the seventh category the tail folds into{' '}
            <code className="type-mono">chartOtherToken</code> rather than inventing an eighth hue.
            Ordered values — pipeline stages, tiers, buckets — use{' '}
            <code className="type-mono">chartStepTokens</code>, one hue light to dark, because
            spending the identity channel on something the sequence already communicates wastes it.
            Values that <em>mean</em> good or bad use{' '}
            <code className="type-mono">chartStatusTokens</code>, and never in the same chart as
            categorical hues. Grid lines and axes come from{' '}
            <code className="type-mono">chartAxisTokens</code>, which is deliberately recessive: the
            furniture should be legible and otherwise invisible.
          </p>
          <p className="type-body-sm mt-3 text-muted-foreground">
            All of these resolve to <code className="type-mono">var(--token)</code> strings, so a
            theme switch flows through at runtime and no chart carries a hardcoded hex.{' '}
            <code className="type-mono">baseChartOptions()</code> in{' '}
            <code className="type-mono">apexChartTheme.ts</code> supplies the shared mark specs —
            thin bars, 2px lines, a hairline grid, quiet hover states that never brighten a whole
            series — with <code className="type-mono">sparklineOptions</code> and{' '}
            <code className="type-mono">donutOptions</code> as the two preset variants.
          </p>
        </ShowcasePanel>

        <ShowcaseExample
          title="Series ramp"
          description="A static specimen of the two ramps. The categorical row is seven distinct hues plus the neutral Other bucket; the ordinal row is five steps of one hue. The distinction is the single most consequential chart decision in the product, so it is worth being able to see both at once."
          layout="bare"
        >
          <ShowcasePanel>
            <div className="space-y-5">
              <div className="space-y-2">
                <SectionLabel>chartTokens — categorical, assigned by position</SectionLabel>
                <svg
                  viewBox="0 0 320 40"
                  role="img"
                  aria-label="Seven categorical chart colours followed by the neutral other bucket"
                  className="h-10 w-full"
                >
                  {['1', '2', '3', '4', '5', '6', '7'].map((slot, i) => (
                    <rect
                      key={slot}
                      x={i * 40}
                      y={0}
                      width={36}
                      height={40}
                      rx={4}
                      fill={`var(--chart-${slot})`}
                    />
                  ))}
                  <rect x={280} y={0} width={36} height={40} rx={4} fill="var(--chart-other)" />
                </svg>
              </div>

              <div className="space-y-2">
                <SectionLabel>chartStepTokens — ordinal, light to dark</SectionLabel>
                <svg
                  viewBox="0 0 320 40"
                  role="img"
                  aria-label="Five ordinal chart steps from light to dark"
                  className="h-10 w-full"
                >
                  {['1', '2', '3', '4', '5'].map((step, i) => (
                    <rect
                      key={step}
                      x={i * 64}
                      y={0}
                      width={60}
                      height={40}
                      rx={4}
                      fill={`var(--chart-step-${step})`}
                    />
                  ))}
                </svg>
              </div>

              <div className="space-y-2">
                <SectionLabel>chartAxisTokens — grid and axis</SectionLabel>
                <svg
                  viewBox="0 0 320 60"
                  role="img"
                  aria-label="Chart furniture: three grid lines above a baseline axis"
                  className="h-16 w-full"
                >
                  {[12, 26, 40].map((y) => (
                    <line
                      key={y}
                      x1={0}
                      y1={y}
                      x2={320}
                      y2={y}
                      stroke="var(--chart-grid)"
                      strokeWidth={1}
                    />
                  ))}
                  <line
                    x1={0}
                    y1={54}
                    x2={320}
                    y2={54}
                    stroke="var(--chart-axis)"
                    strokeWidth={1}
                  />
                  <rect x={16} y={20} width={26} height={34} fill="var(--chart-1)" />
                  <rect x={70} y={8} width={26} height={46} fill="var(--chart-2)" />
                  <rect x={124} y={30} width={26} height={24} fill="var(--chart-3)" />
                </svg>
              </div>
            </div>
          </ShowcasePanel>
        </ShowcaseExample>

        <GuidelineList
          guidelines={[
            {
              do: 'Make the chart state its conclusion — direct labels, an explicit comparison, a centre KPI in a donut.',
              dont: 'Ship a chart whose point only emerges after the reader does the arithmetic.',
            },
            {
              do: 'Keep one value axis per chart and split into two charts when there are two units.',
              dont: 'Add a second y-axis. A dual-axis chart makes any correlation the author wants.',
            },
            {
              do: 'Use chartStepTokens when re-ordering the categories would change the meaning.',
              dont: 'Assign categorical hues to a sequence that already carries its own order.',
            },
            {
              do: 'Pair chartStatusTokens with an icon or label, since warning sits below 3:1 on a light surface.',
              dont: 'Rely on the status hue alone to carry good-or-bad.',
            },
          ]}
        />
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="05 · The finance module's parallel kit"
        description="Named here because the drift is the point, not because it is endorsed."
      >
        <ShowcasePanel>
          <p className="type-body-sm text-muted-foreground">
            <code className="type-mono">src/pages/finance/components/kit.tsx</code> is a second
            component kit, imported by seven files in the finance module. It declares its own{' '}
            <code className="type-mono">Panel</code> and <code className="type-mono">PageHead</code>{' '}
            where the console kit has ConsolePanel, its own{' '}
            <code className="type-mono">StatCard</code> where this section documents both the
            Dashboard StatCard and StatisticCard, its own{' '}
            <code className="type-mono">DataTable</code> with{' '}
            <code className="type-mono">Th</code>/<code className="type-mono">Td</code> where the
            design system already exports a table, and its own{' '}
            <code className="type-mono">EmptyState</code>, <code className="type-mono">Pill</code>,{' '}
            <code className="type-mono">Avatar</code> and <code className="type-mono">Delta</code>.
            Those names collide with design-system exports that are different components, which is
            why a grep for any of them returns misleading counts.
          </p>
          <p className="type-body-sm mt-3 text-muted-foreground">
            One thing did travel the other way: IconChip was promoted out of this kit into the
            design system, and it is now the single card mark everywhere. That is the resolution
            path for the rest of the duplication — settle the argument in a module, then promote the
            winner — and until it happens, a developer working in finance and a developer working in
            a console are building from two different vocabularies for the same shapes.
          </p>
        </ShowcasePanel>
      </ShowcaseSubsection>
    </ShowcaseSection>
  );
}
