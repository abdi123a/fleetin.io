import {
  AlertTriangle,
  Building2,
  Clock,
  ContainerIcon,
  MapPin,
  Package,
  ShieldCheck,
  TrendingUp,
  Truck,
  Wallet,
} from '@/design-system/icons';

import {
  Badge,
  CompanyAvatar,
  CornerBadge,
  DescriptionItem,
  DescriptionList,
  IconChip,
  LinearProgress,
  VerificationBadge,
  type IconChipTint,
} from '@/design-system';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseGrid,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';

/* ---------------------------------------------------------------------------
 * 1. IconChip
 * ------------------------------------------------------------------------- */

const SOLID_TINTS: { tint: IconChipTint; label: string; note: string }[] = [
  { tint: 'teal', label: 'teal', note: 'Reporting figures — the default.' },
  { tint: 'orange', label: 'orange', note: 'A figure the reader must act on.' },
  { tint: 'amber', label: 'amber', note: 'Deadline and expiry marks.' },
  { tint: 'red', label: 'red', note: 'Failures and blocked work.' },
  { tint: 'blue', label: 'blue', note: 'Reference and informational rows.' },
  { tint: 'neutral', label: 'neutral', note: 'Page headers with no state to report.' },
];

/** The shape four consoles use: a module maps its own intent onto a tint. */
type PerformanceIntent = 'brand' | 'accent';
const CHIP: Record<PerformanceIntent, IconChipTint> = {
  brand: 'teal',
  accent: 'orange',
};

function IconChipSubSection() {
  return (
    <ShowcaseSubsection
      title="1. IconChip — the mark that opens a card"
      description="The single icon mark used at the head of a card, a panel, a KPI tile or a list row. It is the most-rendered display primitive in the product, and its whole value is that there is exactly one of it."
    >
      <ShowcasePanel className="space-y-3">
        <h4 className="type-h4 text-foreground">The rule</h4>
        <p className="type-body-sm max-w-3xl text-muted-foreground">
          Round only. One shape, because a rounded square sitting beside a circle reads as two
          products stitched together. The disc is solid and takes the colour itself, never a
          ten-percent wash, so the mark survives greyscale, a screenshot and a projector. Two
          diameters exist: 44px carrying a 20px glyph, and 36px carrying an 18px glyph for dense
          rows. Nothing in between and nothing smaller — a 28px disc loses the icon.
        </p>
      </ShowcasePanel>

      <ShowcaseExample
        title="Sizes"
        description="44 is the default you get by omitting the prop; the app writes size={36} explicitly and never writes 44."
        code={`<IconChip icon={Truck} />              // 44px disc, 20px glyph
<IconChip icon={Truck} size={36} />   // 36px disc, 18px glyph`}
      >
        <div className="flex items-end gap-6">
          <div className="flex flex-col items-center gap-2">
            <IconChip icon={Truck} />
            <span className="type-caption text-muted-foreground">44 — default</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <IconChip icon={Truck} size={36} />
            <span className="type-caption text-muted-foreground">36 — dense rows</span>
          </div>
        </div>
      </ShowcaseExample>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Solid tints</h4>
        <ShowcaseGrid minColumnWidth="11rem">
          {SOLID_TINTS.map(({ tint, label, note }) => (
            <ShowcasePanel key={tint} className="flex items-start gap-3">
              <IconChip icon={Package} tint={tint} size={36} />
              <div className="min-w-0 space-y-0.5">
                <p className="type-mono text-xs text-foreground">{label}</p>
                <p className="type-caption text-muted-foreground">{note}</p>
              </div>
            </ShowcasePanel>
          ))}
        </ShowcaseGrid>
      </div>

      <ShowcaseExample
        title="on-teal and on-light — the inverse pair"
        description="On a filled KPI tile the card already owns the hue, so the disc goes white and takes its glyph colour from the tile. Using a solid tint there would put two colours in one mark."
        layout="column"
        code={`<div className="bg-tile-teal text-tile-teal-foreground">
  <IconChip icon={TrendingUp} tint="on-teal" size={36} />
</div>

<div className="bg-tile-peach text-tile-foreground">
  <IconChip icon={Clock} tint="on-light" size={36} />
</div>`}
      >
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="rounded-card bg-tile-teal p-4 text-tile-teal-foreground">
            <IconChip icon={TrendingUp} tint="on-teal" size={36} />
            <p className="mt-3 type-body-xs text-tile-teal-foreground/85">Shipments delivered</p>
            <p className="type-h3 text-tile-teal-foreground">1,284</p>
          </div>
          <div className="rounded-card bg-tile-peach p-4 text-tile-foreground">
            <IconChip icon={Clock} tint="on-light" size={36} />
            <p className="mt-3 type-body-xs text-tile-foreground/80">Average turnaround</p>
            <p className="type-h3 text-tile-foreground">2.6 days</p>
          </div>
        </div>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Two call forms"
          description="Pass the icon component when you have one. Pass an already-rendered glyph as children when the surrounding component receives its icon as a node — the chip normalises the glyph size either way."
          layout="column"
          code={`<IconChip icon={ShieldCheck} tint="teal" size={36} />

<IconChip tint="orange" size={36}>
  <AlertTriangle />
</IconChip>`}
        >
          <div className="flex items-center gap-4">
            <IconChip icon={ShieldCheck} tint="teal" size={36} />
            <IconChip tint="orange" size={36}>
              <AlertTriangle />
            </IconChip>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="The tone table"
          description="A console declares its own intent enum and maps it onto IconChipTint once, at the top of the file. Nothing downstream writes a tint literal, which is what makes the two-colour rule reviewable — a two-entry table is visibly two colours."
          layout="column"
          code={`export type PerformanceIntent = 'brand' | 'accent';

const CHIP: Record<PerformanceIntent, IconChipTint> = {
  brand: 'teal',
  accent: 'orange',
};

<IconChip icon={metric.icon} tint={CHIP[metric.intent]} size={36} />`}
        >
          <div className="flex items-center gap-4">
            <IconChip icon={Wallet} tint={CHIP.brand} size={36} />
            <IconChip icon={AlertTriangle} tint={CHIP.accent} size={36} />
          </div>
        </ShowcaseExample>
      </div>

      <GuidelineList
        guidelines={[
          { do: 'Use the 44px disc for a card or panel header and the 36px disc for KPI tiles and list rows.', dont: 'Invent a 28px or 48px disc because one layout felt tight.' },
          { do: 'Let the disc carry the full colour with a light glyph on top.', dont: 'Reintroduce a ten-percent tinted wash behind a coloured glyph.' },
          { do: 'Switch to on-teal or on-light whenever the chip sits on a filled tile.', dont: 'Put a solid teal disc on a teal tile, where it disappears into the card.' },
          { do: 'Map a module intent onto a tint in one table at the top of the file.', dont: 'Scatter tint literals through the JSX, where nobody can count the colours.' },
        ]}
      />

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">IconChip props</h4>
        <PropsTable
          props={[
            { name: 'icon', type: 'ComponentType<SVGProps<SVGSVGElement>>', description: 'Icon component, rendered with the size class the chip owns. The union also accepts a plain function component, so lucide icons and module-declared icon props both satisfy it.' },
            { name: 'children', type: 'ReactNode', description: 'Already-rendered glyph, for call sites that receive their icon as a node. The chip normalises its size, so a glyph handed over at size-4 still reads correctly.' },
            { name: 'tint', type: 'IconChipTint', defaultValue: 'teal', description: 'teal | orange | amber | red | blue | neutral | on-teal | on-light. The last two invert the chip for filled tiles.' },
            { name: 'size', type: '44 | 36', defaultValue: '44', description: 'Disc diameter. 44 carries a 20px glyph, 36 carries an 18px glyph. There is no third value.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 2. Badge
 * ------------------------------------------------------------------------- */
function BadgeSubSection() {
  return (
    <ShowcaseSubsection
      title="2. Badge"
      description="The compact status chip. A badge never encodes a business status itself — the feature decides which intent a status maps to, which is why the same chip can label a shipment stage in one module and a payment state in another."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Intents — subtle"
          description="Subtle is the dominant form. It carries state without competing with the row's own text."
          layout="column"
          code={`<Badge variant="subtle" intent="success" size="sm">Delivered</Badge>`}
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="subtle" intent="success" size="sm">Delivered</Badge>
            <Badge variant="subtle" intent="primary" size="sm">In transit</Badge>
            <Badge variant="subtle" intent="info" size="sm">Booked</Badge>
            <Badge variant="subtle" intent="warning" size="sm">Awaiting docs</Badge>
            <Badge variant="subtle" intent="destructive" size="sm">Cancelled</Badge>
            <Badge variant="subtle" intent="accent" size="sm">Action needed</Badge>
            <Badge variant="subtle" intent="default" size="sm">Draft</Badge>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="Solid, and the two sizes"
          description="Solid is reserved for the few chips that must be found at a glance on a busy card. sm is the working size; md is for chips that stand alone in a header."
          layout="column"
          code={`<Badge variant="solid" intent="success" size="sm">Verified</Badge>
<Badge variant="subtle" intent="primary" size="md">Container 40ft</Badge>`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="solid" intent="success" size="sm">Verified</Badge>
            <Badge variant="solid" intent="primary" size="sm">Priority</Badge>
            <Badge variant="subtle" intent="primary" size="md">Container 40ft</Badge>
            <Badge variant="subtle" intent="default" size="md">Prepaid</Badge>
          </div>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Badge props</h4>
        <PropsTable
          props={[
            { name: 'variant', type: 'subtle | solid | outline', defaultValue: 'subtle', description: 'Subtle carries almost every badge in the product; solid is the high-emphasis form. Outline exists in the component but no screen currently uses it.' },
            { name: 'intent', type: 'default | primary | accent | success | warning | destructive | info', defaultValue: 'default', description: 'Maps onto semantic tokens. Pick the intent from what the status means, not from the colour you want.' },
            { name: 'size', type: 'sm | md | lg', defaultValue: 'md', description: 'sm is the size used inside table rows and cards; md is for standalone chips. lg is unused.' },
            { name: 'asChild', type: 'boolean', defaultValue: 'false', description: 'Renders the badge styling onto the child element instead of a span.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 3. Verification & corner tags
 * ------------------------------------------------------------------------- */
function StatusMarksSubSection() {
  return (
    <ShowcaseSubsection
      title="3. Verification and corner tags"
      description="Two marks that sit on a record rather than in its body: the tick that confirms a driver or vehicle has been checked, and the identifier tab cut into a card's top-left corner."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="VerificationBadge"
          description="Only the verified state renders anywhere in the product — a filled brand-teal rosette beside the name it confirms, exactly like a social-media checkmark. Every other state renders nothing; an unverified record shows no mark at all rather than a negative one."
          layout="column"
          code={`<VerificationBadge state="verified" size="sm" />`}
        >
          <div className="flex items-center gap-1">
            <span className="type-body-sm font-semibold text-foreground">Amina Omondi</span>
            <VerificationBadge state="verified" size="sm" />
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="CornerBadge"
          description="The booking or mission identifier, flush into the card corner so the number is found in the same place on every card. The parent card must be overflow-hidden for the corner to clip."
          layout="column"
          code={`<div className="relative overflow-hidden rounded-card border border-border">
  <div className="absolute top-0 left-0">
    <CornerBadge label="Booking No. 1322" intent="teal" position="top" />
  </div>
</div>`}
        >
          <div className="relative w-full overflow-hidden rounded-card border border-border bg-surface p-4 pt-12">
            <div className="absolute left-0 top-0 select-none">
              <CornerBadge label="Booking No. 1322" intent="teal" position="top" />
            </div>
            <p className="type-body-sm text-muted-foreground">
              Djibouti Port to Dire Dawa, 40ft containerised.
            </p>
          </div>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">Props</h4>
        <PropsTable
          props={[
            { name: 'state', type: 'VerificationState', required: true, description: 'VerificationBadge. Defines verified, pending, unverified and rejected; only verified renders anything.' },
            { name: 'size', type: 'sm | md | lg', defaultValue: 'md', description: 'VerificationBadge. Icon size — sm sits inline with body text, lg beside a page-header name.' },
            { name: 'label', type: 'string', required: true, description: 'CornerBadge. The identifier text, e.g. "Booking No. 1322".' },
            { name: 'intent', type: 'CornerBadgeIntent', defaultValue: 'teal', description: 'CornerBadge. Every corner tag in the product is teal, because the tab identifies the record rather than reporting its state.' },
            { name: 'position', type: 'top | second | inline', defaultValue: 'top', description: 'CornerBadge. top rounds only the bottom-right corner so the tab reads as cut into the card; second stacks a tag directly underneath the first.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 4. CompanyAvatar
 * ------------------------------------------------------------------------- */
function CompanySubSection() {
  return (
    <ShowcaseSubsection
      title="4. CompanyAvatar — the logo beside the name"
      description="A named shipper, transporter or partner is always drawn as its mark followed by its name. A carrier scanning a delay table recognises the logo long before finishing the words, so a bare name is a regression."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="Logo through src, initials as fallback"
          description="Every real call site resolves a logo URL and passes explicit initials for the case where none is on file. The sizes in use are xs for table cells and sm for card titles."
          layout="column"
          code={`<CompanyAvatar
  src={getCompanyLogoUrl(id)}
  name={name}
  fallback={companyInitials(name)}
  size="xs"
  shape="circle"
  className="shrink-0"
/>`}
        >
          <div className="space-y-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CompanyAvatar
                src="/logo/fleetin-icon.png"
                name="FLEETIN Logistics"
                fallback="FL"
                size="xs"
                shape="circle"
                className="shrink-0"
              />
              <span className="type-body-sm text-muted-foreground">FLEETIN Logistics</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CompanyAvatar
                src="/logo/dpcs-icon.png"
                name="DP Container Services"
                fallback="DP"
                size="sm"
                shape="circle"
                className="shrink-0"
              />
              <span className="type-body-sm font-medium text-foreground">DP Container Services</span>
            </span>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="No logo on file"
          description="The fallback is initials on the secondary surface — never a blank circle, and never the name on its own."
          layout="column"
          code={`<CompanyAvatar name="Marill Transport" fallback="MT" size="sm" shape="circle" />`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CompanyAvatar name="Marill Transport" fallback="MT" size="sm" shape="circle" />
            <span className="type-body-sm font-medium text-foreground">Marill Transport</span>
          </span>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">CompanyAvatar props</h4>
        <PropsTable
          props={[
            { name: 'src', type: 'string', description: 'Logo URL. Omitting it is the exception, not the norm — the fallback exists for companies with no mark on file.' },
            { name: 'name', type: 'string', description: 'Used for the image alt text, and to derive initials when no fallback is given.' },
            { name: 'fallback', type: 'string', description: 'Explicit initials, shown while the logo loads and if it fails.' },
            { name: 'size', type: 'xs | sm | md | lg | xl', defaultValue: 'md', description: 'xs for table cells and inline rows, sm for card titles. The larger sizes are unused.' },
            { name: 'shape', type: 'circle | rounded', defaultValue: 'circle', description: 'Call sites pass circle explicitly so a company mark matches the round IconChip.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 5. LinearProgress
 * ------------------------------------------------------------------------- */
function ProgressSubSection() {
  return (
    <ShowcaseSubsection
      title="5. LinearProgress"
      description="A thin meter under a figure that has already been stated in words. The bar never carries the number itself, which is why no call site turns on label or showValue — the surrounding card owns the text."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="xs — under a KPI figure"
          description="The extra-small track sits at the foot of a stat card, with the reading spelled out beneath it and the accessible name on the bar."
          layout="column"
          code={`<LinearProgress
  value={meterValue}
  size="xs"
  status={meterStatus}
  aria-label={meterLabel}
/>`}
        >
          <div className="w-full space-y-1.5">
            <p className="type-display tabular-nums text-foreground">92%</p>
            <LinearProgress value={92} size="xs" status="success" aria-label="On-time delivery" />
            <p className="type-caption text-muted-foreground">On-time delivery, last 30 days</p>
          </div>
        </ShowcaseExample>

        <ShowcaseExample
          title="sm — profile completeness"
          description="The status is derived, not chosen: success only at 100, warning until then. Colour repeats what the percentage already says rather than adding a third signal."
          layout="column"
          code={`<LinearProgress
  value={completion.percentage}
  size="sm"
  status={completion.percentage === 100 ? 'success' : 'warning'}
  aria-label="Profile completeness"
/>`}
        >
          <div className="w-full space-y-2">
            <LinearProgress value={100} size="sm" status="success" aria-label="Profile completeness" />
            <LinearProgress value={68} size="sm" status="warning" aria-label="Profile completeness" />
          </div>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">LinearProgress props</h4>
        <PropsTable
          props={[
            { name: 'value', type: 'number', description: 'Percentage, clamped to 0–100. Every call site passes a real value.' },
            { name: 'size', type: 'xs | sm | md | lg', defaultValue: 'md', description: 'xs under a KPI figure, sm inside a panel. The heavier tracks are unused.' },
            { name: 'status', type: 'ProgressStatus', defaultValue: 'default', description: 'default | success | warning | danger. Usually held on the row model, so the card and the bar cannot disagree.' },
            { name: 'aria-label', type: 'string', description: 'Required in practice: the bar carries no visible label, so this is the only name assistive technology gets.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * 6. DescriptionList
 * ------------------------------------------------------------------------- */
function ListsSubSection() {
  return (
    <ShowcaseSubsection
      title="6. DescriptionList"
      description="The labelled detail grid used on record pages. It renders a real dl, so the label and its value stay associated when the layout collapses to one column on a narrow screen."
    >
      <ShowcaseExample
        title="Grid layout, three columns"
        description="Three columns is the shape a registration or compliance panel uses: short labels, short values, no dividers. The grid drops to a single column below the sm breakpoint."
        layout="column"
        code={`<DescriptionList layout="grid" cols={3}>
  <DescriptionItem label="Legal entity" value={shipper.companyLegalName} />
  <DescriptionItem
    label="Registration no."
    value={<span className="type-mono">{shipper.registrationNumber}</span>}
  />
  <DescriptionItem label="Country" value={shipper.country} />
</DescriptionList>`}
      >
        <DescriptionList layout="grid" cols={3} className="w-full">
          <DescriptionItem label="Legal entity" value="Marill Trading PLC" />
          <DescriptionItem
            label="Registration no."
            value={<span className="type-mono">DJ-2019-44812</span>}
          />
          <DescriptionItem label="Country" value="Djibouti" />
          <DescriptionItem label="Industry" value="Agricultural commodities" />
          <DescriptionItem label="Company scale" value="200–500 staff" />
          <DescriptionItem label="Customer since" value="12 Mar 2024" />
        </DescriptionList>
      </ShowcaseExample>

      <div className="grid gap-6 md:grid-cols-2">
        <ShowcaseExample
          title="A single item with an icon"
          description="One value that needs its own emphasis is lifted out of the grid onto a sunken panel. The icon labels the field, so it goes next to the label and not the value."
          layout="column"
          code={`<DescriptionItem
  label="Headquarters"
  icon={<MapPin />}
  value={\`\${shipper.address}, \${shipper.country}\`}
  className="rounded-card-nested bg-surface-sunken p-3"
/>`}
        >
          <DescriptionItem
            label="Headquarters"
            icon={<MapPin />}
            value="Rue de Marseille, Djibouti Ville, Djibouti"
            className="w-full rounded-card-nested bg-surface-sunken p-3"
          />
        </ShowcaseExample>

        <ShowcaseExample
          title="Horizontal items"
          description="The horizontal form pushes the value to the right edge and adds row padding, for a stacked list where every line is one fact."
          layout="column"
          code={`<DescriptionList layout="horizontal">
  <DescriptionItem horizontal icon={<ContainerIcon />} label="Container type" value="40ft high cube" />
</DescriptionList>`}
        >
          <DescriptionList layout="horizontal" className="w-full">
            <DescriptionItem horizontal icon={<ContainerIcon />} label="Container type" value="40ft high cube" />
            <DescriptionItem horizontal icon={<Building2 />} label="Consignee" value="Dire Dawa Depot" />
            <DescriptionItem horizontal icon={<Clock />} label="Free time left" value="3 days" />
          </DescriptionList>
        </ShowcaseExample>
      </div>

      <div className="space-y-2">
        <h4 className="type-h4 text-foreground">DescriptionList and DescriptionItem props</h4>
        <PropsTable
          props={[
            { name: 'layout', type: 'stacked | horizontal | grid', defaultValue: 'stacked', description: 'Grid is the form record panels use; horizontal adds dividers between rows.' },
            { name: 'cols', type: '1 | 2 | 3 | 4', defaultValue: '2', description: 'Column count when layout is grid. Every column count collapses to one on narrow screens.' },
            { name: 'dense', type: 'boolean', defaultValue: 'false', description: 'Tightens the row gap for panels holding many short fields.' },
            { name: 'label', type: 'ReactNode', required: true, description: 'DescriptionItem. Rendered as the dt.' },
            { name: 'value', type: 'ReactNode', required: true, description: 'DescriptionItem. Rendered as the dd; an empty value falls back to an em dash.' },
            { name: 'horizontal', type: 'boolean', defaultValue: 'false', description: 'DescriptionItem. Puts the label and value on one line with the value right-aligned.' },
            { name: 'icon', type: 'ReactNode', description: 'DescriptionItem. Sits beside the label, sized down to 14px by the component.' },
          ]}
        />
      </div>
    </ShowcaseSubsection>
  );
}

/* ---------------------------------------------------------------------------
 * Main Export Component
 * ------------------------------------------------------------------------- */
export function DisplaySection() {
  return (
    <ShowcaseSection
      id="display"
      index="10"
      title="Display Components"
      description="The marks a record wears: the icon chip that opens a card, the badge that reports its state, the company logo that names it, the meter under a figure, and the labelled grid that lays out its details."
    >
      <IconChipSubSection />
      <BadgeSubSection />
      <StatusMarksSubSection />
      <CompanySubSection />
      <ProgressSubSection />
      <ListsSubSection />
    </ShowcaseSection>
  );
}
