import {
  AlertTriangle,
  FileText,
  Link2,
  PackageSearch,
  Plus,
  Truck,
  User,
  Users,
} from '@/design-system/icons';

import { Badge, Button } from '@/design-system';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LocationCard,
  ShipmentCard,
  Skeleton,
  StatisticCard,
} from '@/design-system';

import { EmptyState as AppEmptyState, PageHeader } from '@/components';

import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
  type PropDefinition,
} from '@/design-system/showcase';

/* ---------------------------------------------------------------------------
 * 1. PageHeader — the product's page masthead
 * ------------------------------------------------------------------------- */

const pageHeaderProps: PropDefinition[] = [
  { name: 'title', type: 'string', required: true, description: 'The single <h1> on the page, rendered in brand teal.' },
  { name: 'description', type: 'string', description: 'One supporting sentence under the title. Capped at max-w-2xl so it stays readable.' },
  { name: 'badge', type: 'ReactNode', description: 'Status chip beside the title — a Badge in every current call site.' },
  { name: 'actions', type: 'ReactNode', description: 'Right-aligned buttons on wide screens; they wrap under the title on mobile.' },
  { name: 'className', type: 'string', description: 'Spacing overrides only. Do not restyle the title here.' },
];

function PageHeaderSubsection() {
  return (
    <ShowcaseSubsection
      title="Page header"
      description="PageHeader from @/components is the masthead every module opens with — fifteen pages use it, including this one. It exists so that all modules share one heading rhythm and every page emits exactly one <h1>."
    >
      <ShowcaseExample
        title="Page masthead"
        description="Title, supporting sentence, status badge and right-aligned actions. This is the block sitting at the top of Drivers, Missions, Partners, Shippers, Vehicles, Locations, Finance and Administration."
        layout="bare"
        code={`<PageHeader
  title="Driver Directory"
  description="Every driver registered against a transporter, with licence and assignment state."
  badge={<Badge intent="primary" variant="subtle">24 active</Badge>}
  actions={<Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />}>Add Driver</Button>}
/>`}
      >
        <div className="p-5">
          <PageHeader
            title="Driver Directory"
            description="Every driver registered against a transporter, with licence and assignment state."
            badge={<Badge intent="primary" variant="subtle">24 active</Badge>}
            actions={
              <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />}>
                Add Driver
              </Button>
            }
          />
        </div>
      </ShowcaseExample>

      <h4 className="type-h4 text-foreground">PageHeader props</h4>
      <PropsTable props={pageHeaderProps} />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 2. Card
 * ------------------------------------------------------------------------- */

const cardProps: PropDefinition[] = [
  { name: 'variant', type: "'default' | 'flat'", defaultValue: "'default'", description: 'default is a 1px border with rounded-card (16px) and no shadow. flat drops to border-subtle and rounded-card-nested (12px) for a panel sitting inside another panel.' },
  { name: 'padding', type: "'none' | 'sm' | 'md' | 'lg'", defaultValue: "'none'", description: 'none when the children own their own spacing (list rows, tables, charts). sm 16px, md 20px, lg 24px.' },
  { name: 'clickable', type: 'boolean', defaultValue: 'false', description: 'Adds the pointer cursor, the hover border/background shift and a focus ring. Set it whenever the whole card navigates somewhere.' },
  { name: 'asButton', type: 'boolean', defaultValue: 'false', description: 'Gives the card role="button" and tabIndex 0. Required for keyboard users when the card is the only way to reach the destination.' },
  { name: 'className', type: 'string', description: 'Layout and surface additions — height, gap, and the shadow-card panel elevation.' },
];

function CardSubsection() {
  return (
    <ShowcaseSubsection
      title="Card"
      description="Card is the frame under almost every surface in the product: 77 files import it. It carries a border and a 16px radius and deliberately no shadow, because a data-dense screen full of lifted boxes reads as noise."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ShowcaseExample
          title="Variants"
          description="Only two of the six declared variants are used. default is the outer panel; flat is the inner panel, one step quieter, used for the contact tiles inside the shipper compliance panel."
          layout="column"
          code={`<Card variant="default" padding="md">…</Card>
<Card variant="flat" padding="sm">…</Card>`}
        >
          <Card variant="default" padding="md" className="w-full">
            <p className="type-body-sm font-medium text-foreground">variant="default"</p>
            <p className="type-body-xs text-muted-foreground">
              border-border, rounded-card (16px), no shadow. 52 call sites.
            </p>
          </Card>
          <Card variant="flat" padding="sm" className="w-full">
            <p className="type-body-sm font-medium text-foreground">variant="flat"</p>
            <p className="type-body-xs text-muted-foreground">
              border-border-subtle, rounded-card-nested (12px). For panels nested in panels.
            </p>
          </Card>
        </ShowcaseExample>

        <ShowcaseExample
          title="Padding"
          description="lg is the default reach for a dashboard panel. none is for cards whose children run edge to edge — tables, chart canvases, list rows with their own dividers."
          layout="column"
          code={`<Card padding="lg">…</Card>
<Card padding="none">…</Card>`}
        >
          {(
            [
              { value: 'lg', note: '24px — dashboard and console panels' },
              { value: 'md', note: '20px — KPI and metric tiles' },
              { value: 'sm', note: '16px — dense inner cards' },
              { value: 'none', note: 'no padding — children own their spacing' },
            ] as const
          ).map((item) => (
            <Card key={item.value} padding={item.value} className="w-full">
              <p className="type-body-sm font-medium text-foreground">padding="{item.value}"</p>
              <p className="type-body-xs text-muted-foreground">{item.note}</p>
            </Card>
          ))}
        </ShowcaseExample>
      </div>

      <ShowcaseExample
        title="Composition — CardHeader, CardTitle, CardContent"
        description="One app file composes Card out of sub-parts, and it uses exactly these three. Everything else passes children straight into Card and lays them out with flex."
        layout="column"
        code={`<Card variant="default" padding="none">
  <CardHeader>
    <CardTitle>Compliance documents</CardTitle>
    <Badge intent="warning" variant="subtle">2 expiring</Badge>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>`}
      >
        <Card variant="default" padding="none" className="w-full">
          <CardHeader>
            <CardTitle>Compliance documents</CardTitle>
            <Badge intent="warning" variant="subtle">2 expiring</Badge>
          </CardHeader>
          <CardContent>
            {['Operating licence', 'Insurance certificate', 'Tax clearance'].map((doc) => (
              <div
                key={doc}
                className="flex items-center gap-2 border-b border-border py-2.5 type-body-sm text-muted-foreground last:border-0"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                {doc}
              </div>
            ))}
          </CardContent>
        </Card>
      </ShowcaseExample>

      <ShowcaseExample
        title="Clickable card"
        description="A card that navigates must say so. clickable supplies the hover and focus treatment; asButton supplies the role and tab stop, which is what makes it reachable without a mouse."
        layout="column"
        code={`<Card variant="default" padding="md" clickable asButton onClick={openShipper}>…</Card>`}
      >
        <Card variant="default" padding="md" clickable asButton className="w-full" onClick={() => undefined}>
          <p className="type-body-sm font-medium text-foreground">Marill Logistics</p>
          <p className="type-body-xs text-muted-foreground">14 open shipments — press Enter to open</p>
        </Card>
      </ShowcaseExample>

      <ShowcasePanel>
        <h4 className="type-h4 text-foreground">Panel elevation is a class, not a variant</h4>
        <p className="mt-1.5 type-body-sm text-muted-foreground">
          Every dashboard panel in the product is written as{' '}
          <code className="type-mono text-primary">
            &lt;Card variant="default" padding="lg" className={'{cn(…, PANEL_SURFACE)}'}&gt;
          </code>
          , where <code className="type-mono text-primary">PANEL_SURFACE</code> is the string{' '}
          <code className="type-mono text-primary">'shadow-card'</code> exported by the console kits.
          Elevation therefore arrives through a class, not through a Card variant — no app file passes{' '}
          <code className="type-mono text-primary">variant="elevated"</code>. Reach for the kit's constant so
          all panels lift by the same amount; the console section documents the panel wrapper itself.
        </p>
      </ShowcasePanel>

      <h4 className="type-h4 text-foreground">Card props</h4>
      <PropsTable props={cardProps} />

      <GuidelineList
        guidelines={[
          {
            do: 'Use padding="none" and let the child own its spacing when the content runs to the card edge.',
            dont: 'Set a padding and then cancel it with a negative margin on the child.',
          },
          {
            do: 'Pair clickable with asButton so the card is reachable by keyboard.',
            dont: 'Attach onClick to a plain Card and leave keyboard users with no way in.',
          },
          {
            do: 'Add shadow-card (PANEL_SURFACE) when the card is a top-level dashboard panel.',
            dont: 'Give a panel a coloured top edge or a second nested shadow to make it stand out.',
          },
        ]}
      />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 3. StatisticCard
 * ------------------------------------------------------------------------- */

const statisticCardProps: PropDefinition[] = [
  { name: 'title', type: 'string', required: true, description: 'Metric name, rendered under the value.' },
  { name: 'value', type: 'string | number', description: 'The number itself. Renders an em dash when undefined.' },
  { name: 'subtitle', type: 'string', description: 'Short qualifier such as "Ready for Load" or "vs last month".' },
  { name: 'variant', type: "'teal' | 'blue' | 'peach' | 'pink'", description: 'The tile fill. Every KPI strip in the app assigns one colour per tile, left to right, and reuses the same order across modules.' },
  { name: 'trend', type: "'up' | 'down' | 'neutral'", description: 'Direction arrow shown before the percentage. Only renders when percentage is also set.' },
  { name: 'percentage', type: 'string | number', description: 'Delta beside the arrow. A bare number gets a % appended; any other string is printed as given.' },
  { name: 'icon', type: 'ReactNode', description: 'A 20px lucide glyph. The card wraps it in an IconChip and picks the tint from the variant, so pass the bare icon with no colour class.' },
  { name: 'onClick', type: '() => void', description: 'Makes the tile a button with a focus ring. Omit it and the tile is inert.' },
];

function StatisticCardSubsection() {
  return (
    <ShowcaseSubsection
      title="Statistic card"
      description="The KPI strip that opens Drivers, Missions, Partners, Shippers, Vehicles and Onboarding. It is always four tiles across on desktop, and each tile takes a filled colour — the outlined default tone is not used anywhere in the product."
    >
      <ShowcaseExample
        title="KPI strip"
        description="Teal, blue, peach, pink, in that order. The colours are not semantic: they separate one metric from the next, they do not encode good or bad. Direction is carried by the trend arrow instead."
        layout="bare"
        code={`<StatisticCard
  title="Total Drivers"
  value={totalDrivers}
  subtitle="Registered Drivers"
  variant="teal"
  trend="up"
  percentage="100%"
  icon={<User className="h-5 w-5" />}
/>`}
      >
        <div className="grid gap-3.5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { title: 'Total Drivers', value: '248', subtitle: 'Registered Drivers', variant: 'teal', trend: 'up', percentage: '100%', icon: <User className="h-5 w-5" /> },
              { title: 'Available', value: '132', subtitle: 'Ready for Load', variant: 'blue', trend: 'up', percentage: '53%', icon: <Users className="h-5 w-5" /> },
              { title: 'In Transit', value: '94', subtitle: 'Active Driving', variant: 'peach', trend: 'up', percentage: '+15%', icon: <Truck className="h-5 w-5" /> },
              { title: 'Licence Alerts', value: '6', subtitle: 'Requires Attention', variant: 'pink', trend: 'down', percentage: '6 alerts', icon: <AlertTriangle className="h-5 w-5" /> },
            ] as const
          ).map((tile) => (
            <StatisticCard key={tile.title} {...tile} />
          ))}
        </div>
      </ShowcaseExample>

      <h4 className="type-h4 text-foreground">StatisticCard props</h4>
      <PropsTable props={statisticCardProps} />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 4. ShipmentCard
 * ------------------------------------------------------------------------- */

const shipmentCardProps: PropDefinition[] = [
  { name: 'shipmentNumber, bookingNumber', type: 'string', required: true, description: 'The corner tags at the top-left. bookingNumber is optional and appears only once the shipment is booked.' },
  { name: 'origin, destination', type: 'string', required: true, description: 'The two ends of the route timeline down the left side.' },
  { name: 'organization, createdBy', type: 'string', required: true, description: 'Shipper company and its contact. The company goes through CompanyAvatar, so the name always arrives with its logo beside it.' },
  { name: 'vehicleType, transporterLogoUrl, vehicleSpecs', type: 'string', required: true, description: 'Transporter company, its logo and its fleet code. Pass the logo whenever the record has one; the avatar falls back to initials otherwise.' },
  { name: 'date, goodsType, goodsWeight', type: 'string', required: true, description: 'Pickup time and cargo, all pre-formatted by the caller — the card does no number or date formatting of its own.' },
  { name: 'dpcsReference', type: 'string', description: 'DPCS reference code for the customs leg.' },
  { name: 'driverName, truckPlate', type: 'string', description: 'Assignment line. Both stay empty until a truck is allocated.' },
  { name: 'distance, duration, paymentStatus', type: 'string', description: 'Route estimates and the payment label, e.g. "215 km", "4h 10m", "Invoiced".' },
  { name: 'status', type: 'string', defaultValue: "'Created'", description: 'Status badge text, taken straight from the record.' },
  { name: 'statusIntent', type: "'orange' | 'green' | 'blue' | 'slate'", defaultValue: "'orange'", description: 'Badge colour. The app maps Completed to green, En Route and Arrived to blue, Cancelled and Failed to slate, everything else to orange.' },
  { name: 'density', type: "'comfortable' | 'compact' | 'thin'", defaultValue: "'comfortable'", description: 'thin collapses the card into a single strip for split list/detail views; compact keeps the full layout but shortens it. Both current call sites take the default.' },
  { name: 'clickable, onClick', type: 'boolean, () => void', description: 'Hover and focus affordance plus the handler that opens the shipment.' },
  { name: 'onCancel', type: '() => void', description: 'Adds Cancel to the card overflow menu.' },
];

function ShipmentCardSubsection() {
  return (
    <ShowcaseSubsection
      title="Shipment card"
      description="The route card used by the Missions list and the partner detail page. It carries the whole shipment at a glance: corner tags, the origin-to-destination timeline, shipper and transporter with their logos, cargo, assignment and status."
    >
      <ShowcaseExample
        title="Shipment card"
        description="Props here match the Missions list exactly. The card ignores several older props that survive on the interface for back-compat — time, totalBids, shipmentType, hideFromAdda and the rest render nothing, so do not pass them."
        layout="bare"
        code={`<ShipmentCard
  shipmentNumber={mission.id} date={mission.scheduledPickupTime}
  origin={mission.pickupLocation.name} destination={mission.deliveryLocation.name}
  organization={mission.customer.company} createdBy={mission.customer.name}
  vehicleType={mission.transporter.company} vehicleSpecs={mission.transporter.fleetCode}
  goodsType={mission.goodsDescription} goodsWeight="28t · Containerized"
  status={mission.status} statusIntent="blue"
  clickable onClick={() => openMission(mission)}
/>`}
      >
        <div className="p-5">
          <ShipmentCard
            shipmentNumber="1338"
            bookingNumber="1172"
            origin="Djibouti Port"
            destination="Dire Dawa Terminal"
            organization="Marill Logistics"
            createdBy="Amina Omondi"
            dpcsReference="DPCS-84120"
            date="12 Aug 2026 · 09:00"
            goodsType="Edible oils"
            goodsWeight="28t · Containerized"
            vehicleType="Gulf Freight"
            transporterLogoUrl="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&auto=format&fit=crop&q=80"
            vehicleSpecs="GLF-TRK-09"
            driverName="Mohamed Barkad"
            truckPlate="340D103"
            distance="215 km"
            duration="4h 10m"
            paymentStatus="Invoiced"
            status="En Route"
            statusIntent="blue"
            clickable
          />
        </div>
      </ShowcaseExample>

      <h4 className="type-h4 text-foreground">ShipmentCard props</h4>
      <PropsTable props={shipmentCardProps} />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 5. LocationCard
 * ------------------------------------------------------------------------- */

const locationCardProps: PropDefinition[] = [
  { name: 'city', type: 'string', required: true, description: 'City name, set beside a MapPin IconChip.' },
  { name: 'cityLabel', type: 'string', defaultValue: "'City'", description: 'Caption under the city, so a record can say "Port" or "Depot" instead.' },
  { name: 'address', type: 'string', required: true, description: 'Street address, the widest column of the row.' },
  { name: 'addressLabel', type: 'string', defaultValue: "'Address Type 1'", description: 'Caption under the address.' },
  { name: 'onViewMap', type: '() => void', description: 'Adds View Map to the overflow menu. Items only appear when their handler is supplied.' },
  { name: 'onEdit', type: '() => void', description: 'Adds Edit to the overflow menu.' },
  { name: 'onDelete', type: '() => void', description: 'Adds Delete, styled destructive.' },
];

function LocationCardSubsection() {
  return (
    <ShowcaseSubsection
      title="Location card"
      description="The full-width row the Locations page is built from. It is a row rather than a tile because a saved location is two long strings — a city and an address — and those read badly in a narrow column."
    >
      <ShowcaseExample
        title="Location row"
        description="The overflow menu is built from whichever handlers you pass, so a read-only view simply omits onEdit and onDelete and the menu shrinks."
        layout="bare"
        code={`<LocationCard
  city={location.city}
  address={location.address}
  addressLabel={location.addressLabel}
  onViewMap={() => showOnMap(location)}
  onEdit={() => editLocation(location)}
  onDelete={() => deleteLocation(location.id)}
/>`}
      >
        <div className="space-y-4 p-5">
          <LocationCard
            city="Djibouti"
            address="Doraleh Multipurpose Port, Gate 4"
            addressLabel="Port terminal"
            onViewMap={() => undefined}
            onEdit={() => undefined}
            onDelete={() => undefined}
          />
          <LocationCard
            city="Dire Dawa"
            address="Industrial Zone, Warehouse 12"
            onViewMap={() => undefined}
          />
        </div>
      </ShowcaseExample>

      <h4 className="type-h4 text-foreground">LocationCard props</h4>
      <PropsTable props={locationCardProps} />
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 6. Empty states
 * ------------------------------------------------------------------------- */

function EmptyStateSubsection() {
  return (
    <ShowcaseSubsection
      title="Empty state"
      description="Two empty states ship, with incompatible APIs. The design-system one takes a rendered icon node and up to two action slots; the one in @/components takes a lucide component and a single action, and draws the icon as an IconChip. Both are live, so read the import line before copying an example."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ShowcaseExample
          title="Design-system EmptyState"
          description="Used by the Empty Returns console — the chains panel and the transporters list. Icon is a ReactNode you size yourself; the action goes in primaryAction. Every app call site takes the default md size."
          layout="column"
          code={`import { EmptyState } from '@/design-system';
<EmptyState icon={<Link2 className="h-6 w-6" aria-hidden />} title="No active chain."
  description="Create a cycle from Matching."
  primaryAction={<Button size="sm">Go to Matching</Button>} />`}
        >
          <Card padding="lg" className="w-full">
            <EmptyState
              icon={<Link2 className="h-6 w-6" aria-hidden />}
              title="No active chain."
              description="Create a cycle from Matching."
              primaryAction={<Button size="sm">Go to Matching</Button>}
            />
          </Card>
        </ShowcaseExample>

        <ShowcaseExample
          title="Application EmptyState"
          description="Used by the placeholder page, the 404 page and the shipper compliance panel. Icon is the lucide component itself, which the card wraps in the standard IconChip, and there is one action slot."
          layout="column"
          code={`import { EmptyState } from '@/components';
<EmptyState icon={PackageSearch} title="No shipments match these filters"
  description="Clear the date range or pick a different shipper project."
  action={<Button variant="outline" size="sm">Clear filters</Button>} />`}
        >
          <Card padding="lg" className="w-full">
            <AppEmptyState
              icon={PackageSearch}
              title="No shipments match these filters"
              description="Clear the date range or pick a different shipper project."
              action={<Button variant="outline" size="sm">Clear filters</Button>}
            />
          </Card>
        </ShowcaseExample>
      </div>

      <ShowcasePanel>
        <h4 className="type-h4 text-foreground">Which one to reach for</h4>
        <p className="mt-1.5 type-body-sm text-muted-foreground">
          Neither is deprecated, so the honest rule is to match the surface you are working on: console panels
          under Empty Returns use the design-system version, and page-level shells use the one from{' '}
          <code className="type-mono text-primary">@/components</code>. The Finance module then defines a third
          inside its own kit. Three components with three APIs for one idea is drift, and consolidating them is
          outstanding work rather than a decision this page can document away.
        </p>
      </ShowcasePanel>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 7. Skeleton
 * ------------------------------------------------------------------------- */

const skeletonProps: PropDefinition[] = [
  { name: 'shape', type: "'text' | 'block' | 'circle'", defaultValue: "'block'", description: 'text fixes the height at 16px with a small radius so a placeholder line matches the line it replaces. block takes its size from className.' },
  { name: 'variant', type: "'shimmer' | 'pulse' | 'static'", defaultValue: "'shimmer'", description: 'shimmer sweeps a gradient across the placeholder. pulse carries its own motion-reduce guard; static is for tests and print.' },
  { name: 'className', type: 'string', description: 'Width and height. A skeleton should be roughly the size of the content it stands in for.' },
];

function SkeletonSubsection() {
  return (
    <ShowcaseSubsection
      title="Skeleton"
      description="Eleven files build their loading states from this one primitive: a KPI strip, chart cards, tables. There is no composed CardSkeleton or PageSkeleton in the product — each loading state is assembled from bare Skeletons in the shape of the thing that is loading."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ShowcaseExample
          title="shape=&quot;text&quot;"
          description="Stands in for a line of copy. Vary the widths — placeholder lines of identical length read as a table, not as prose."
          layout="column"
          code={`<Skeleton shape="text" className="h-4 w-20" />
<Skeleton shape="text" className="h-8 w-16" />`}
        >
          <Card padding="md" className="w-full gap-2">
            <Skeleton shape="text" className="h-4 w-20" />
            <Skeleton shape="text" className="h-8 w-16" />
          </Card>
        </ShowcaseExample>

        <ShowcaseExample
          title="shape=&quot;block&quot;"
          description="Stands in for a chart canvas, an avatar or a tile. Give it the real dimensions of the block it replaces so the layout does not jump when the data lands."
          layout="column"
          code={`<Skeleton className="h-32 w-full" />
<Skeleton className="size-11 rounded-full" />`}
        >
          <Card padding="md" className="w-full gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <Skeleton shape="text" className="h-4 w-28" />
            </div>
            <Skeleton className="h-24 w-full" />
          </Card>
        </ShowcaseExample>
      </div>

      <h4 className="type-h4 text-foreground">Skeleton props</h4>
      <PropsTable props={skeletonProps} />

      <ShowcasePanel>
        <h4 className="type-h4 text-foreground">Announcing the wait</h4>
        <p className="mt-1.5 type-body-sm text-muted-foreground">
          Skeleton renders <code className="type-mono text-primary">role="presentation"</code> and{' '}
          <code className="type-mono text-primary">aria-hidden</code>, so the shapes themselves say nothing to a
          screen reader. Put <code className="type-mono text-primary">aria-busy</code> on the container that is
          loading — that is what announces the wait, and it is easy to forget once the visual placeholder looks
          convincing.
        </p>
      </ShowcasePanel>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Main export
 * ------------------------------------------------------------------------- */

export function LayoutSection() {
  return (
    <ShowcaseSection
      id="layout"
      index="09"
      title="Layout & Cards"
      description="The frames the product actually ships: the page masthead, the Card every surface sits in, the KPI tile, the shipment and location rows, the empty state and the loading placeholder. Everything documented here has at least one live call site outside the design system."
    >
      <PageHeaderSubsection />
      <CardSubsection />
      <StatisticCardSubsection />
      <ShipmentCardSubsection />
      <LocationCardSubsection />
      <EmptyStateSubsection />
      <SkeletonSubsection />
    </ShowcaseSection>
  );
}
