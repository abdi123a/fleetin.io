import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import {
  Badge,
  CompanyAvatar,
  EnterpriseDataTable,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/design-system';
import { ArrowRight } from '@/design-system/icons';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';

import {
  COLUMN_META_PROPS,
  DATA_TABLE_ACCESSIBILITY,
  DATA_TABLE_GUIDELINES,
  DATA_TABLE_KEYBOARD,
  DATA_TABLE_PERFORMANCE,
  ENTERPRISE_DATA_TABLE_PROPS,
  TABLE_PRIMITIVE_PROPS,
} from '../catalog/dataTable.catalog';

/* ---------------------------------------------------------------------------
 * Demo data
 * ------------------------------------------------------------------------- */

interface DemoShipment {
  shipmentId: string;
  reference: string;
  cargoType: string;
  origin: string;
  destination: string;
  transporter: string;
  stageLabel: string;
  stage: 'booked' | 'moving' | 'delivered';
  promisedOn: string;
  cost: number;
}

const DEMO_SHIPMENTS: DemoShipment[] = [
  { shipmentId: 's-1', reference: 'FLT-24118', cargoType: 'Dry container', origin: 'Doraleh', destination: 'Dire Dawa', transporter: 'Horn Freight', stageLabel: 'In transit', stage: 'moving', promisedOn: '14 Aug', cost: 412_000 },
  { shipmentId: 's-2', reference: 'FLT-24119', cargoType: 'Reefer', origin: 'Doraleh', destination: 'Addis Ababa', transporter: 'Rift Valley Logistics', stageLabel: 'At border', stage: 'moving', promisedOn: '15 Aug', cost: 688_500 },
  { shipmentId: 's-3', reference: 'FLT-24120', cargoType: 'Bulk cement', origin: 'Tadjoura', destination: 'Mekelle', transporter: 'Awash Carriers', stageLabel: 'Booked', stage: 'booked', promisedOn: '17 Aug', cost: 245_000 },
  { shipmentId: 's-4', reference: 'FLT-24121', cargoType: 'Dry container', origin: 'Doraleh', destination: 'Adama', transporter: 'Horn Freight', stageLabel: 'Delivered', stage: 'delivered', promisedOn: '11 Aug', cost: 377_200 },
  { shipmentId: 's-5', reference: 'FLT-24122', cargoType: 'Flatbed', origin: 'Djibouti City', destination: 'Hawassa', transporter: 'Awash Carriers', stageLabel: 'Loading', stage: 'moving', promisedOn: '16 Aug', cost: 519_000 },
  { shipmentId: 's-6', reference: 'FLT-24123', cargoType: 'Reefer', origin: 'Doraleh', destination: 'Addis Ababa', transporter: 'Rift Valley Logistics', stageLabel: 'Delivered', stage: 'delivered', promisedOn: '10 Aug', cost: 702_800 },
  { shipmentId: 's-7', reference: 'FLT-24124', cargoType: 'Dry container', origin: 'Doraleh', destination: 'Jijiga', transporter: 'Somali Coast Transit', stageLabel: 'Booked', stage: 'booked', promisedOn: '19 Aug', cost: 298_400 },
  { shipmentId: 's-8', reference: 'FLT-24125', cargoType: 'Bulk cement', origin: 'Tadjoura', destination: 'Semera', transporter: 'Somali Coast Transit', stageLabel: 'In transit', stage: 'moving', promisedOn: '15 Aug', cost: 184_900 },
];

interface DemoTransporter {
  name: string;
  cycles: number;
  onTimePct: number;
  avgTurnHours: number;
}

const DEMO_TRANSPORTERS: DemoTransporter[] = [
  { name: 'Horn Freight', cycles: 46, onTimePct: 92, avgTurnHours: 31 },
  { name: 'Rift Valley Logistics', cycles: 38, onTimePct: 88, avgTurnHours: 36 },
  { name: 'Awash Carriers', cycles: 27, onTimePct: 74, avgTurnHours: 48 },
  { name: 'Somali Coast Transit', cycles: 19, onTimePct: 81, avgTurnHours: 42 },
];

const djf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/* ---------------------------------------------------------------------------
 * Which table to reach for
 * ------------------------------------------------------------------------- */

function WhichTable() {
  return (
    <ShowcaseSubsection
      title="Three table shapes, and which one to reach for"
      description="The product does not have one table. It has three, and the honest reason is that they were added at different times for different jobs."
    >
      <div className="space-y-3 type-body-sm text-muted-foreground">
        <p>
          <code className="type-mono text-foreground">EnterpriseDataTable</code> is the full framework — toolbar
          search, click-to-sort headers, a Column Manager, pagination and a responsive card fallback, all driven
          from one set of column definitions. It renders on exactly one screen today: the Shipments panel of the
          shipper detail page. Reach for it when a table genuinely needs all of that at once.
        </p>
        <p>
          The <code className="type-mono text-foreground">Table</code> primitives — <code className="type-mono">TableRoot</code>,{' '}
          <code className="type-mono">TableHeader</code>, <code className="type-mono">TableBody</code>,{' '}
          <code className="type-mono">TableRow</code>, <code className="type-mono">TableHead</code>,{' '}
          <code className="type-mono">TableCell</code>, <code className="type-mono">TableCaption</code> — are the
          styled shell with no machinery behind it. One screen uses them directly, the empty-return transporters
          page. This is the right choice for a fixed table that is read rather than queried: it costs nothing and
          it still gets the house borders, spacing and caption behaviour.
        </p>
        <p>
          Eighteen files build their table from raw <code className="type-mono">&lt;table&gt;</code> markup instead,
          and the finance module keeps its own <code className="type-mono">DataTable</code>/
          <code className="type-mono">Th</code>/<code className="type-mono">Td</code> in{' '}
          <code className="type-mono">pages/finance/components/kit.tsx</code>, used by two files and reaching four
          finance screens. That is the majority of tables in the product, and it is drift rather than a decision.
          New work should use the primitives instead: they produce the same markup and stay in step with the tokens.
        </p>
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * EnterpriseDataTable — the one real call site
 * ------------------------------------------------------------------------- */

function EnterpriseTableExample() {
  const columns = useMemo<ColumnDef<DemoShipment, unknown>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Reference',
        meta: { label: 'Reference', width: 160, cellClassName: 'w-44' },
        cell: ({ row }) => (
          <div>
            <p className="type-mono font-medium whitespace-nowrap text-foreground">{row.original.reference}</p>
            <p className="type-caption whitespace-nowrap text-muted-foreground">{row.original.cargoType}</p>
          </div>
        ),
      },
      {
        id: 'corridor',
        accessorFn: (row) => `${row.origin} ${row.destination}`,
        header: 'Corridor',
        meta: { label: 'Corridor' },
        cell: ({ row }) => (
          <p className="flex items-center gap-1.5 type-body-sm whitespace-nowrap text-foreground">
            <span className="truncate">{row.original.origin}</span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{row.original.destination}</span>
          </p>
        ),
      },
      {
        accessorKey: 'transporter',
        header: 'Transporter',
        meta: { label: 'Transporter', width: 200 },
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <CompanyAvatar size="xs" name={row.original.transporter} />
            <span className="type-body-sm text-foreground">{row.original.transporter}</span>
          </span>
        ),
      },
      {
        accessorKey: 'stageLabel',
        header: 'Stage',
        meta: { label: 'Stage', width: 130 },
        cell: ({ row }) => (
          <Badge
            intent={
              row.original.stage === 'delivered' ? 'success' : row.original.stage === 'moving' ? 'primary' : 'default'
            }
            size="sm"
          >
            {row.original.stageLabel}
          </Badge>
        ),
      },
      {
        accessorKey: 'promisedOn',
        header: 'Promised',
        meta: { label: 'Promised', width: 120 },
        cell: ({ row }) => (
          <span className="type-body-sm whitespace-nowrap tabular-nums text-foreground">{row.original.promisedOn}</span>
        ),
      },
      {
        accessorKey: 'cost',
        header: 'Cost (DJF)',
        meta: { label: 'Cost', align: 'right', width: 130 },
        cell: ({ row }) => (
          <span className="type-body-sm whitespace-nowrap tabular-nums text-foreground">
            {djf.format(row.original.cost)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ShowcaseSubsection
      title="EnterpriseDataTable"
      description="This example passes the same props the product's only call site passes, and nothing else."
    >
      <ShowcaseExample
        layout="bare"
        description="Search, sortable headers, the Column Manager and the pager all come from the defaults — none of them is switched on by a prop. Below md the rows stack as cards built from these same column definitions."
        code={`const columns = useMemo<ColumnDef<ShipperShipmentRow, unknown>[]>(() => [
  {
    accessorKey: 'reference',
    header: 'Reference',
    meta: { label: 'Reference', width: 160, cellClassName: 'w-44' },
    cell: ({ row }) => /* … */,
  },
  { accessorKey: 'cost', header: 'Cost (DJF)', meta: { label: 'Cost', align: 'right', width: 130 } },
], []);

<EnterpriseDataTable
  data={visible}
  columns={columns}
  getRowId={(row) => row.shipmentId}
  density="compact"
  stickyHeader
  maxBodyHeight="40rem"
  responsive
  searchPlaceholder="Search reference, corridor or transporter…"
  onRowClick={onOpenShipment}
  caption="Shipments for this shipper"
  emptyState={{
    title: 'No shipments on this account yet',
    description: 'Bookings appear here as soon as the first one is registered.',
  }}
  noResultsState={{
    title: 'No shipments match',
    description: 'Clear the search term or pick another lifecycle filter.',
  }}
/>`}
      >
        <EnterpriseDataTable
          data={DEMO_SHIPMENTS}
          columns={columns}
          getRowId={(row) => row.shipmentId}
          density="compact"
          stickyHeader
          maxBodyHeight="24rem"
          responsive
          searchPlaceholder="Search reference, corridor or transporter…"
          caption="Demo shipments"
          emptyState={{
            title: 'No shipments on this account yet',
            description: 'Bookings appear here as soon as the first one is registered.',
          }}
          noResultsState={{
            title: 'No shipments match',
            description: 'Clear the search term or pick another lifecycle filter.',
          }}
        />
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Table primitives
 * ------------------------------------------------------------------------- */

function TablePrimitivesExample() {
  return (
    <ShowcaseSubsection
      title="Table primitives"
      description="The styled shell on its own, for a table that is read rather than queried."
    >
      <ShowcaseExample
        layout="bare"
        description={
          <>
            The horizontal scroll lives on the wrapper around <code className="type-mono">TableRoot</code>, never on
            the page body — a narrow screen has to reach the last column without dragging the whole layout sideways.
            Numeric columns get <code className="type-mono">align=&quot;right&quot;</code> on both the head and the
            cell, so the header sits over its own digits.
          </>
        }
        code={`<div className="overflow-x-auto">
  <TableRoot>
    <TableCaption>Cycle activity by transporter</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead className="bg-surface-sunken">Transporter</TableHead>
        <TableHead className="bg-surface-sunken" align="right">Cycles</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody className="divide-border-subtle">
      {rows.map((row) => (
        <TableRow key={row.name}>
          <TableCell className="py-3 font-medium">{row.name}</TableCell>
          <TableCell className="py-3" align="right">{row.cycles}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </TableRoot>
</div>`}
      >
        <div className="overflow-x-auto">
          <TableRoot>
            <TableCaption>Cycle activity by transporter</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-surface-sunken">Transporter</TableHead>
                <TableHead className="bg-surface-sunken whitespace-nowrap" align="right">
                  Cycles
                </TableHead>
                <TableHead className="bg-surface-sunken whitespace-nowrap" align="right">
                  On time
                </TableHead>
                <TableHead className="bg-surface-sunken whitespace-nowrap" align="right">
                  Avg turn
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-border-subtle">
              {DEMO_TRANSPORTERS.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="py-3 font-medium">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <CompanyAvatar size="xs" name={row.name} />
                      {row.name}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 tabular-nums" align="right">
                    {row.cycles}
                  </TableCell>
                  <TableCell className="py-3 tabular-nums" align="right">
                    {row.onTimePct}%
                  </TableCell>
                  <TableCell className="py-3 tabular-nums" align="right">
                    {row.avgTurnHours}h
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableRoot>
        </div>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Developer API
 * ------------------------------------------------------------------------- */

function DeveloperApi() {
  return (
    <ShowcaseSubsection
      title="Developer API"
      description="Only the props with a live call site in the product are listed."
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">EnterpriseDataTable&lt;T&gt;</h4>
          <PropsTable props={ENTERPRISE_DATA_TABLE_PROPS} />
          <p className="type-body-sm text-muted-foreground">
            The component also implements advanced filters (<code className="type-mono">filters</code> +{' '}
            <code className="type-mono">FilterBar</code>), row selection with a bulk action bar, a row-actions menu,
            a card layout, saved views, export and a server-driven mode. Nothing in the product passes any of them,
            so none of that is documented here as a pattern — treat it as capability that exists, not as the house
            way to build a table.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Column meta</h4>
          <p className="type-body-sm text-muted-foreground">
            TanStack&rsquo;s <code className="type-mono">ColumnMeta</code> is augmented so a column definition can
            carry its own presentation instead of a parallel config object.
          </p>
          <PropsTable props={COLUMN_META_PROPS} />
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Table primitives</h4>
          <PropsTable props={TABLE_PRIMITIVE_PROPS} />
        </div>
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Guidelines, accessibility, performance
 * ------------------------------------------------------------------------- */

function Notes() {
  return (
    <ShowcaseSubsection title="Guidelines" description="Rules the two real tables in the product actually follow.">
      <div className="space-y-6">
        <GuidelineList guidelines={DATA_TABLE_GUIDELINES} />

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Accessibility</h4>
          <NoteList notes={DATA_TABLE_ACCESSIBILITY} />
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Keyboard</h4>
          <NoteList notes={DATA_TABLE_KEYBOARD} />
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Performance</h4>
          <NoteList notes={DATA_TABLE_PERFORMANCE} />
        </div>
      </div>
    </ShowcaseSubsection>
  );
}

function NoteList({ notes }: { notes: string[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <ul className="divide-y divide-border-subtle">
        {notes.map((note) => (
          <li key={note} className="px-4 py-3 type-body-sm text-muted-foreground">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Section export
 * ------------------------------------------------------------------------- */

export function DataTableSection() {
  return (
    <ShowcaseSection
      id="data-table"
      index="11"
      title="Tables"
      description="Two table components ship in the design system: the EnterpriseDataTable framework, on one screen, and the Table primitives it is built from, on another. Most tables in the product are still hand-written markup."
    >
      <WhichTable />
      <EnterpriseTableExample />
      <TablePrimitivesExample />
      <DeveloperApi />
      <Notes />
    </ShowcaseSection>
  );
}
