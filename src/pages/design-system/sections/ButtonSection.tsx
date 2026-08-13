import {
  Bell,
  Download,
  Filter,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Share2,
  Trash2,
  Upload,
} from '@/design-system/icons';

import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '@/design-system';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseItem,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';

import {
  BUTTON_ACCESSIBILITY,
  BUTTON_GROUP_PROPS,
  BUTTON_GUIDELINES,
  BUTTON_PROPS,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  ICON_BUTTON_PROPS,
} from '../catalog/buttons.catalog';

/**
 * Section 07 — Buttons.
 *
 * The reference for the application's only button implementation. Every example
 * renders the real component, so the page cannot show a button the code does
 * not actually produce.
 */
export function ButtonSection() {
  return (
    <ShowcaseSection
      id="buttons"
      index="07"
      title="Buttons"
      description="One Button component covers every clickable action in the application. Modules import it rather than defining their own — if a need is not expressible here, the component gains a variant instead of the feature gaining a bespoke control."
    >
      <Overview />
      <Variants />
      <Sizes />
      <IconButtons />
      <LoadingButtons />
      <DisabledStates />
      <ButtonGroups />
      <OverflowMenus />
      <BestPractices />
      <AccessibilityNotes />
      <DeveloperApi />
    </ShowcaseSection>
  );
}

/* -------------------------------------------------------------------------- */

function Overview() {
  return (
    <ShowcaseSubsection
      title="Overview"
      description="Three exports cover every case: Button for labelled actions, IconButton for icon-only controls that must carry an accessible name, and ButtonGroup for buttons presented as one control. All three render from a single class-variance-authority definition, so they cannot drift apart visually."
    >
      <ShowcaseExample
        title="The common cases"
        code={`import { Button, IconButton } from '@/design-system';

<Button leadingIcon={<Plus />}>Create shipment</Button>
<Button variant="outline">Export</Button>
<IconButton aria-label="Filter results"><Filter /></IconButton>`}
      >
        <Button leadingIcon={<Plus />}>Create shipment</Button>
        <Button variant="outline" leadingIcon={<Download />}>
          Export
        </Button>
        <Button variant="ghost">Cancel</Button>
        <Tooltip content="Filter results">
          <IconButton aria-label="Filter results">
            <Filter />
          </IconButton>
        </Tooltip>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function Variants() {
  return (
    <ShowcaseSubsection
      title="Variants"
      description="Emphasis, not decoration. The variant communicates how important an action is and what it will do — pick it from the action's weight, never from what looks good in the layout."
      aside={`${BUTTON_VARIANTS.length} variants`}
    >
      <ShowcaseExample layout="bare">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {BUTTON_VARIANTS.map((entry) => (
            <div key={entry.variant} className="space-y-1.5">
              <Button variant={entry.variant}>{entry.label}</Button>
              <p className="type-caption text-muted-foreground">{entry.usage}</p>
            </div>
          ))}
        </div>
      </ShowcaseExample>

      <ShowcaseExample
        title="On the page canvas"
        description="Outline and ghost read differently off the surface colour — check both when choosing between them."
        canvas
      >
        {BUTTON_VARIANTS.map((entry) => (
          <Button key={entry.variant} variant={entry.variant} size="sm">
            {entry.label}
          </Button>
        ))}
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function Sizes() {
  return (
    <ShowcaseSubsection
      title="Sizes"
      description="Pick from the density of the surrounding UI and keep it consistent within any group. md is the component default, but sm is what the product overwhelmingly ships — page actions, toolbars and panels are all sm. lg appears in exactly one place: the full-width submit on the auth screens."
    >
      <ShowcaseExample layout="bare">
        <div className="flex flex-wrap items-end gap-5">
          {BUTTON_SIZES.map((entry) => (
            <ShowcaseItem key={entry.size} label={`${entry.label} · ${entry.height}`}>
              <Button size={entry.size}>Assign driver</Button>
            </ShowcaseItem>
          ))}
        </div>
      </ShowcaseExample>

      <ShowcaseExample
        title="The auth submit"
        description="lg, full width and type=submit, with isLoading held for the duration of the request. This one composition is the reason the lg size exists."
        layout="column"
        code={`<Button type="submit" size="lg" fullWidth isLoading={isPending}>
  Sign in
</Button>`}
      >
        <div className="w-full max-w-sm space-y-2">
          <Button type="submit" size="lg" fullWidth>
            Sign in
          </Button>
          <Button type="submit" size="lg" fullWidth isLoading>
            Sign in
          </Button>
        </div>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function IconButtons() {
  return (
    <ShowcaseSubsection
      title="Icon buttons"
      description="An icon with no label is invisible to a screen reader, so IconButton makes aria-label a required prop — the compiler rejects an unlabelled one. Pair with a Tooltip so sighted users get the same information on hover."
    >
      <ShowcaseExample
        title="The two treatments in use"
        description="Every IconButton in the product is small, ghost or outline. The pill shape is the header notification bell."
        code={`<IconButton aria-label="Edit partner" size="sm" variant="ghost"><Pencil /></IconButton>
<IconButton aria-label="Print manifest" size="sm" variant="outline"><Printer /></IconButton>`}
      >
        <ShowcaseItem label="ghost">
          <IconButton aria-label="Edit partner" size="sm" variant="ghost">
            <Pencil />
          </IconButton>
        </ShowcaseItem>
        <ShowcaseItem label="outline">
          <IconButton aria-label="Print manifest" size="sm" variant="outline">
            <Printer />
          </IconButton>
        </ShowcaseItem>
        <ShowcaseItem label="pill">
          <IconButton aria-label="Notifications" size="sm" variant="outline" shape="pill">
            <Bell />
          </IconButton>
        </ShowcaseItem>
      </ShowcaseExample>

      <ShowcaseExample
        title="asChild, for a real link"
        description="The contact header ships its call and email actions as anchors, so the OS handles tel: and mailto: rather than JavaScript."
        code={`<IconButton aria-label="Call Berbera Logistics" size="sm" variant="outline" asChild>
  <a href="tel:+252611234567"><Phone /></a>
</IconButton>`}
      >
        <IconButton aria-label="Call Berbera Logistics" size="sm" variant="outline" asChild>
          <a href="tel:+252611234567">
            <Phone />
          </a>
        </IconButton>
        <IconButton aria-label="Email Berbera Logistics" size="sm" variant="outline" asChild>
          <a href="mailto:ops@berbera.example">
            <Mail />
          </a>
        </IconButton>
      </ShowcaseExample>

      <ShowcaseExample
        title="Always pair with a tooltip"
        description="The tooltip is for sighted users; aria-label is for assistive technology. Both are needed — neither replaces the other."
        code={`<Tooltip content="Export to CSV">
  <IconButton aria-label="Export to CSV"><Download /></IconButton>
</Tooltip>`}
      >
        <Tooltip content="Export to CSV">
          <IconButton aria-label="Export to CSV" variant="outline">
            <Download />
          </IconButton>
        </Tooltip>
        <Tooltip content="Upload documents">
          <IconButton aria-label="Upload documents" variant="outline">
            <Upload />
          </IconButton>
        </Tooltip>
        <Tooltip content="Refresh data">
          <IconButton aria-label="Refresh data" variant="outline">
            <RefreshCw />
          </IconButton>
        </Tooltip>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function LoadingButtons() {
  return (
    <ShowcaseSubsection
      title="Loading"
      description="isLoading swaps the leading icon for a spinner, disables the control and sets aria-busy — so an in-flight action cannot be submitted twice. Every call site in the product passes the boolean alone; loadingText exists and would announce the pending state more precisely, but nothing has adopted it."
    >
      <ShowcaseExample
        code={`<Button isLoading>Save changes</Button>
<Button variant="outline" isLoading>Export</Button>`}
      >
        <Button isLoading>Save changes</Button>
        <Button variant="outline" isLoading>
          Export
        </Button>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function DisabledStates() {
  return (
    <ShowcaseSubsection
      title="Disabled"
      description="A disabled button gives no feedback on click, so it must be obvious why it is unavailable. Explain the reason nearby — or better, leave the control enabled and validate on activation."
    >
      <ShowcaseExample>
        {BUTTON_VARIANTS.map((entry) => (
          <Button key={entry.variant} variant={entry.variant} disabled>
            {entry.label}
          </Button>
        ))}
        <IconButton aria-label="Delete (unavailable)" size="sm" variant="ghost" disabled>
          <Trash2 />
        </IconButton>
      </ShowcaseExample>

      <ShowcaseExample
        title="Disabled with an explanation"
        description="A tooltip on a wrapper keeps the reason reachable — a disabled button does not fire pointer events of its own."
      >
        <Tooltip content="Assign a vehicle before dispatching">
          <span tabIndex={0} className="inline-flex rounded-md">
            <Button disabled leadingIcon={<Send />}>
              Dispatch shipment
            </Button>
          </span>
        </Tooltip>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function ButtonGroups() {
  return (
    <ShowcaseSubsection
      title="Button groups"
      description="Buttons presented as one control. Attached joins them into a segmented control with a single shared border; spaced keeps them separate for dialog footers. Corner and border handling is done in CSS, so any button works inside a group — including one wrapped in a Tooltip or a menu trigger."
    >
      <ShowcaseExample
        title="Attached"
        code={`<ButtonGroup aria-label="Date range">
  <Button variant="outline">Day</Button>
  <Button variant="outline">Week</Button>
  <Button variant="outline">Month</Button>
</ButtonGroup>`}
      >
        <ButtonGroup aria-label="Date range">
          <Button variant="outline">Day</Button>
          <Button variant="outline">Week</Button>
          <Button variant="outline">Month</Button>
        </ButtonGroup>

        <ButtonGroup aria-label="View mode" >
          <IconButton aria-label="List view" variant="outline">
            <MoreHorizontal />
          </IconButton>
          <IconButton aria-label="Search" variant="outline">
            <Search />
          </IconButton>
          <IconButton aria-label="Filter" variant="outline">
            <Filter />
          </IconButton>
        </ButtonGroup>
      </ShowcaseExample>

      <ShowcaseExample
        title="Spaced"
        description="The standard dialog footer arrangement — primary action last, on the right."
        code={`<ButtonGroup attached={false} aria-label="Form actions">
  <Button variant="ghost">Cancel</Button>
  <Button>Save changes</Button>
</ButtonGroup>`}
      >
        <ButtonGroup attached={false} aria-label="Form actions">
          <Button variant="ghost">Cancel</Button>
          <Button>Save changes</Button>
        </ButtonGroup>
      </ShowcaseExample>

      <ShowcaseExample title="Vertical" layout="column">
        <ButtonGroup orientation="vertical" aria-label="Row actions">
          <Button variant="outline" size="sm" leadingIcon={<Pencil />}>
            Edit
          </Button>
          <Button variant="outline" size="sm" leadingIcon={<Share2 />}>
            Share
          </Button>
          <Button variant="outline" size="sm" leadingIcon={<Trash2 />}>
            Delete
          </Button>
        </ButtonGroup>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}


/* -------------------------------------------------------------------------- */

function OverflowMenus() {
  return (
    <ShowcaseSubsection
      title="Overflow menus"
      description="Once a row or header has more than about three actions, the rest belong behind an overflow menu. Keep the one or two the user reaches for most as visible buttons and move the tail — especially destructive actions — into the menu."
    >
      <ShowcaseExample
        title="Row actions"
        code={`<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <IconButton aria-label="More actions"><MoreHorizontal /></IconButton>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">…</DropdownMenuContent>
</DropdownMenu>`}
      >
        <Button variant="outline" size="sm" leadingIcon={<Pencil />}>
          Edit
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="More actions" size="sm" variant="outline">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Partner actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Share2 aria-hidden />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download aria-hidden />
              Export record
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Printer aria-hidden />
              Print
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 aria-hidden />
              Delete partner
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}


/* -------------------------------------------------------------------------- */

function BestPractices() {
  return (
    <ShowcaseSubsection
      title="Best practices"
      description="Most button problems are hierarchy problems: too many competing actions, or a label that does not say what will happen."
    >
      <GuidelineList guidelines={BUTTON_GUIDELINES} />

      <ShowcaseExample
        title="Navigation uses asChild"
        description="A router link rendered through asChild is a real anchor: middle-click, right-click and “open in new tab” all work, and assistive technology announces it as a link rather than a button."
        code={`<Button asChild variant="ghost">
  <Link to="/partners">View all partners</Link>
</Button>`}
      >
        <Button asChild variant="ghost">
          <Link to={ROUTES.partners}>View all partners</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={ROUTES.vehicles}>Go to vehicles</Link>
        </Button>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function AccessibilityNotes() {
  return (
    <ShowcaseSubsection
      title="Accessibility"
      description="Guarantees the component makes, so a feature does not have to re-derive them."
    >
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ul className="divide-y divide-border-subtle">
          {BUTTON_ACCESSIBILITY.map((note) => (
            <li key={note} className="px-4 py-3 type-body-sm text-muted-foreground">
              {note}
            </li>
          ))}
        </ul>
      </div>

      <ShowcaseExample
        title="Keyboard"
        description="Tab to move between buttons, Enter or Space to activate. Focus each of these with the keyboard to check the ring — including the middle segment, where the ring must not be clipped by its neighbours."
      >
        <Button variant="outline">First</Button>
        <ButtonGroup aria-label="Keyboard demo">
          <Button variant="outline">Left</Button>
          <Button variant="outline">Middle</Button>
          <Button variant="outline">Right</Button>
        </ButtonGroup>
        <Button variant="outline">Last</Button>
      </ShowcaseExample>
    </ShowcaseSubsection>
  );
}

/* -------------------------------------------------------------------------- */

function DeveloperApi() {
  return (
    <ShowcaseSubsection
      title="Developer API"
      description="Import everything from @/design-system. The variant definition lives in buttonVariants.ts and is shared by all three components."
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">Button</h4>
          <PropsTable props={BUTTON_PROPS} />
          <p className="type-caption text-muted-foreground">
            Also accepts every native <code className="type-mono">button</code> attribute —
            <code className="type-mono"> onClick</code>,{' '}
            <code className="type-mono">form</code>, <code className="type-mono">name</code>,{' '}
            <code className="type-mono">value</code> — plus a forwarded ref.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">IconButton</h4>
          <PropsTable props={ICON_BUTTON_PROPS} />
        </div>

        <div className="space-y-2">
          <h4 className="type-h4 text-foreground">ButtonGroup</h4>
          <PropsTable props={BUTTON_GROUP_PROPS} />
        </div>
      </div>
    </ShowcaseSubsection>
  );
}
