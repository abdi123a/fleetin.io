import { useState } from 'react';

import { Building2, Search, Upload } from '@/design-system/icons';
import {
  Avatar,
  Checkbox,
  Combobox,
  DatePicker,
  Input,
  Select,
  TagInput,
  TimePicker,
} from '@/design-system';
import {
  GuidelineList,
  PropsTable,
  ShowcaseExample,
  ShowcaseSection,
  ShowcaseSubsection,
  type PropDefinition,
} from '@/design-system/showcase';
import { cn } from '@/utils';

/**
 * Section 08 — Forms & Inputs.
 *
 * Documents the controls the product actually ships and, just as importantly,
 * the field block it wraps them in. FLEETIN builds forms from `useState` and a
 * hand-written label/control/error trio — there is no form library, no schema
 * resolver and no form context in any product screen. Earlier versions of this
 * page documented a React Hook Form + Zod architecture, a FormField wrapper and
 * a FormWizard, none of which had ever been called from application code; a
 * showcase that teaches an architecture the product does not have is worse than
 * no showcase, because it sends every new form down a path nothing else follows.
 */

const SHIPPER_OPTIONS = [
  { value: 'berbera', label: 'Berbera Logistics', icon: <Avatar size="xs" fallback="BL" /> },
  { value: 'horn', label: 'Horn Freight Co.', icon: <Avatar size="xs" fallback="HF" /> },
  { value: 'juba', label: 'Juba Cargo Lines', icon: <Avatar size="xs" fallback="JC" /> },
];

const CITY_OPTIONS = [
  { value: 'mogadishu', label: 'Mogadishu' },
  { value: 'djibouti', label: 'Djibouti' },
  { value: 'hargeisa', label: 'Hargeisa' },
  { value: 'berbera', label: 'Berbera' },
];

/** The two label treatments in production, so the split is visible rather than folklore. */
const LABEL_ONBOARDING = 'block type-caption font-medium text-foreground';
const LABEL_SHEET = 'block text-[11px] font-bold text-foreground';

const INPUT_PROPS: PropDefinition[] = [
  { name: 'inputSize', type: "'sm' | 'md'", defaultValue: "'md'", description: 'md for forms, sm for filter bars and table rows.' },
  { name: 'leadingIcon', type: 'ReactNode', description: 'Icon rendered before the value.' },
  { name: 'trailingIcon', type: 'ReactNode', description: 'Icon rendered after the value.' },
  { name: 'isPassword', type: 'boolean', defaultValue: 'false', description: 'Adds the visibility toggle. Used by the auth screens.' },
  { name: 'isClearable', type: 'boolean', defaultValue: 'false', description: 'Adds a clear button once the field has a value. Pair with onClear.' },
  { name: 'onClear', type: '() => void', description: 'Called when the clear button is pressed.' },
  { name: 'hasError', type: 'boolean', defaultValue: 'false', description: 'Error highlight. Drive it from Boolean(errors.field).' },
];

const SELECT_PROPS: PropDefinition[] = [
  { name: 'options', type: 'SelectOption[]', required: true, description: 'The option list. Always pass this rather than option children.' },
  { name: 'selectSize', type: "'sm' | 'md'", defaultValue: "'md'", description: 'Roughly half the call sites pass sm for filter bars and dense rows; the other half omit it and get md inside sheets and forms.' },
  { name: 'placeholder', type: 'string', description: 'Rendered as a disabled first option.' },
  { name: 'containerClassName', type: 'string', defaultValue: "'w-full'", description: 'Width control on the wrapper — the usual reason to touch it.' },
  { name: 'hasError', type: 'boolean', defaultValue: 'false', description: 'Error highlight.' },
];

const COMBOBOX_PROPS: PropDefinition[] = [
  { name: 'options', type: 'ComboboxOption[]', required: true, description: '{ value, label, icon? }. The icon slot is how a company shows its logo beside its name.' },
  { name: 'value', type: 'string', description: 'Selected value.' },
  { name: 'onChange', type: '(value: string) => void', description: 'Called with the new value.' },
  { name: 'leadingIcon', type: 'ReactNode', description: 'Icon on the trigger, before the selected label.' },
  { name: 'searchable', type: 'boolean', defaultValue: 'true', description: 'Hides the search box when false — for short lists.' },
];

const TAG_INPUT_PROPS: PropDefinition[] = [
  { name: 'value', type: 'string[]', required: true, description: 'Committed tags.' },
  { name: 'onChange', type: '(values: string[]) => void', required: true, description: 'Called with the full updated list.' },
  { name: 'transform', type: '(raw: string) => string', description: 'Applied before commit. Container numbers uppercase here.' },
];

export function FormsSection() {
  const [containers, setContainers] = useState<string[]>(['MSKU4829106']);
  const [shipper, setShipper] = useState('berbera');
  const [city, setCity] = useState('mogadishu');
  const [date, setDate] = useState('2026-08-20');
  const [time, setTime] = useState('09:00 AM');
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('ops@');
  const [confirmed, setConfirmed] = useState(false);

  const emailError = email.includes('@') && email.endsWith('@') ? 'Enter a full email address' : undefined;

  return (
    <ShowcaseSection
      id="forms"
      index="08"
      title="Forms & Inputs"
      description="The controls the product ships, and the field block it wraps them in. FLEETIN forms are plain useState — a typed errors object, cleared per field on change, surfaced through hasError plus a sibling message. There is no form library, no resolver and no form context anywhere in application code, so none is documented here."
    >
      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="The field block"
        description="Label, control, error. Every form in the product is built from this trio by hand — copy this shape rather than reaching for a wrapper component."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ShowcaseExample
            title="Anatomy"
            description="Required fields carry a destructive asterisk in the label. The error message is a sibling paragraph, not a prop."
            layout="column"
            code={`<div className="space-y-1.5">
  <label htmlFor="email" className="block type-caption font-medium text-foreground">
    Contact email <span className="text-destructive">*</span>
  </label>
  <Input
    id="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    hasError={Boolean(errors.email)}
  />
  {errors.email && (
    <p className="type-caption text-destructive">{errors.email}</p>
  )}
</div>`}
          >
            <div className="w-full space-y-1.5">
              <label htmlFor="ds-email" className={LABEL_ONBOARDING}>
                Contact email <span className="text-destructive">*</span>
              </label>
              <Input
                id="ds-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                hasError={Boolean(emailError)}
                placeholder="ops@company.com"
              />
              {emailError && <p className="type-caption text-destructive">{emailError}</p>}
            </div>
          </ShowcaseExample>

          <ShowcaseExample
            title="Two label treatments are in production"
            description="Onboarding forms use type-caption font-medium; sheets and modals use an 11px bold. Both are shipped and neither is wrong — pick the one that matches the surface you are on."
            layout="column"
          >
            <div className="w-full space-y-4">
              <div className="space-y-1.5">
                <span className={LABEL_ONBOARDING}>Onboarding — type-caption font-medium</span>
                <Input placeholder="Company legal name" />
              </div>
              <div className="space-y-1.5">
                <span className={LABEL_SHEET}>SHEET — text-[11px] font-bold</span>
                <Input inputSize="sm" placeholder="Booking reference" />
              </div>
            </div>
          </ShowcaseExample>
        </div>

        <GuidelineList
          guidelines={[
            {
              do: 'Keep errors in a typed object with explicit optional keys, and clear a key on that field\'s change handler.',
              dont: 'Do not reach for react-hook-form or a schema resolver. No form in the product uses one, and adding it to a single form fragments the codebase. Zod is a dependency, but it parses API responses in the BI contracts — it has never been a form resolver here.',
            },
            {
              do: 'Pass hasError to the control and render the message as a sibling paragraph in type-caption text-destructive.',
              dont: 'Do not rely on a wrapper to render the message; there is no FormField in application code.',
            },
            {
              do: 'Mark required fields with a destructive asterisk inside the label.',
              dont: 'Do not mark optional fields — the asterisk is the only signal, so its absence has to mean something.',
            },
          ]}
        />
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="Text inputs"
        description="Two sizes are in use: md is the default for forms, sm for filter bars and dense table rows. lg exists but no screen uses it."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ShowcaseExample title="Sizes" layout="column" code={`<Input inputSize="md" />\n<Input inputSize="sm" />`}>
            <div className="w-full space-y-3">
              <Input inputSize="md" placeholder="Medium — the form default" />
              <Input inputSize="sm" placeholder="Small — filter bars and table rows" />
            </div>
          </ShowcaseExample>

          <ShowcaseExample
            title="Leading icon, clearable, password"
            description="The three props the product actually passes."
            layout="column"
            code={`<Input leadingIcon={<Search />} isClearable onClear={() => setSearch('')} />\n<Input isPassword />`}
          >
            <div className="w-full space-y-3">
              <Input
                inputSize="sm"
                leadingIcon={<Search />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => setSearch('')}
                isClearable
                placeholder="Search shipments"
              />
              <Input isPassword placeholder="Password" defaultValue="fleetin" />
            </div>
          </ShowcaseExample>
        </div>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="Selection"
        description="Select for a short fixed list, Combobox when the list is long enough to need searching or rich enough to need an avatar. Checkbox for opt-ins. There is no radio group and no switch in the product — single choice is always a Select or a set of buttons."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ShowcaseExample
            title="Select — always the options array"
            description="Pass options={[{ value, label }]}. No screen builds a Select from option children, and none passes leadingIcon. Filter bars use sm; sheets and forms omit the prop and get md."
            layout="column"
            code={`<Select
  selectSize="sm"
  options={CITY_OPTIONS}
  value={city}
  onChange={(e) => setCity(e.target.value)}
/>`}
          >
            <Select
              selectSize="sm"
              options={CITY_OPTIONS}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </ShowcaseExample>

          <ShowcaseExample
            title="Combobox — searchable, with an icon per option"
            description="The picker every company field uses: a logo or avatar beside the name, never the bare name."
            layout="column"
            code={`<Combobox
  options={SHIPPER_OPTIONS}   // each { value, label, icon }
  value={shipper}
  onChange={setShipper}
  leadingIcon={<Building2 />}
/>`}
          >
            <Combobox
              options={SHIPPER_OPTIONS}
              value={shipper}
              onChange={setShipper}
              leadingIcon={<Building2 />}
              placeholder="Select a shipper"
            />
          </ShowcaseExample>

          <ShowcaseExample
            title="TagInput"
            description="Enter or comma commits a chip; pasting a whole list splits it. transform runs before commit — container numbers are uppercased."
            layout="column"
            code={`<TagInput
  value={containers}
  onChange={setContainers}
  transform={(raw) => raw.toUpperCase()}
/>`}
          >
            <TagInput
              value={containers}
              onChange={setContainers}
              transform={(raw) => raw.toUpperCase()}
              placeholder="Container numbers"
            />
          </ShowcaseExample>

          <ShowcaseExample
            title="Checkbox"
            description="label, checked, onChange. That is the whole surface the product uses."
            layout="column"
            code={`<Checkbox label="…" checked={confirmed} onChange={…} />`}
          >
            <Checkbox
              label="Confirm the container count matches the manifest"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
          </ShowcaseExample>
        </div>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="Date and time"
        description="Two mechanisms coexist. The popover DatePicker/TimePicker is for creation flows inside a sheet or modal; a native input[type=date] is what filter bars and inline table rows use, and it outnumbers the picker roughly seven to one. Neither is wrong — pick by surface."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ShowcaseExample
            title="The fused Date + Time control"
            description="The only way the product ships TimePicker. Both controls lose their own border and radius, the wrapper carries the ring, and a 1px rule divides them."
            layout="column"
            code={`<div className="flex items-stretch overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
  <DatePicker value={date} onChange={setDate} className="border-0 rounded-none" />
  <div className="w-px bg-border" />
  <TimePicker value={time} onChange={setTime} className="border-0 rounded-none" />
</div>

// TimePicker speaks 12h "hh:mm a"; the app stores 24h "HH:mm".
// An adapter pair on the boundary is mandatory.`}
          >
            <div className="flex w-full items-stretch overflow-hidden rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
              <DatePicker value={date} onChange={setDate} className="rounded-none border-0" />
              <div className="w-px bg-border" />
              <TimePicker value={time} onChange={setTime} className="rounded-none border-0" />
            </div>
          </ShowcaseExample>

          <ShowcaseExample
            title="Native date input"
            description="What filter bars and inline rows use. No popover, no adapter, and it stores the ISO value directly."
            layout="column"
            code={`<input
  type="date"
  className="h-8 rounded-sm border border-input bg-surface px-2.5 text-xs"
/>`}
          >
            <div className="w-full space-y-1.5">
              <span className={LABEL_SHEET}>DATE FROM</span>
              <input
                type="date"
                defaultValue="2026-08-01"
                className={cn(
                  'h-8 w-full rounded-sm border border-input bg-surface px-2.5 text-xs text-foreground',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                )}
              />
            </div>
          </ShowcaseExample>
        </div>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="File upload"
        description="There is no upload primitive. Six screens repeat the same shape — a visually hidden file input inside a styled label — so it is documented here as the sanctioned pattern until it earns a component."
      >
        <ShowcaseExample
          title="The upload chip"
          layout="column"
          code={`<label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed
                  border-primary/40 bg-primary/5 px-2.5 py-1 text-2xs font-semibold text-primary">
  <Upload className="size-3.5" />
  Upload document
  <input type="file" className="hidden" onChange={handleFile} />
</label>`}
        >
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
            <Upload className="size-3.5" aria-hidden />
            Upload document
            <input type="file" className="hidden" />
          </label>
        </ShowcaseExample>
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="Multi-step forms"
        description="Three creation flows implement the same stepper by hand: a STEPS array, currentStep and completedSteps in state, and a validateStep(n) gate that runs before a forward jump. Steps are 1-indexed. The FormWizard primitive is 0-indexed and no screen adopted it."
      >
        <ShowcaseExample title="The step rail" layout="bare" canvas>
          <div className="w-full">
            <StepRail current={2} total={4} labels={['Company', 'Contacts', 'Documents', 'Review']} />
          </div>
        </ShowcaseExample>

        <GuidelineList
          guidelines={[
            {
              do: 'Gate a forward jump on validateStep for every step in between, so a click on step 4 cannot skip an invalid step 2.',
              dont: 'Do not gate a backward jump — going back to fix something must always be free.',
            },
            {
              do: 'Host the flow in a Sheet with a sticky header, a scrollable body and a sticky footer action bar.',
              dont: 'Do not put the step rail inside the scroll area — it is the one thing that must stay visible.',
            },
          ]}
        />
      </ShowcaseSubsection>

      {/* ---------------------------------------------------------------- */}
      <ShowcaseSubsection
        title="Developer API"
        description="Props with a live call site. Input's prefixText, suffixText and hasSuccess, and the lg size on Input and Select, are implemented but unused — they are omitted here so the table stays a description of the product rather than of the component."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <h4 className="type-h4 text-foreground">Input</h4>
            <PropsTable props={INPUT_PROPS} />
          </div>
          <div className="space-y-2">
            <h4 className="type-h4 text-foreground">Select</h4>
            <PropsTable props={SELECT_PROPS} />
          </div>
          <div className="space-y-2">
            <h4 className="type-h4 text-foreground">Combobox</h4>
            <PropsTable props={COMBOBOX_PROPS} />
          </div>
          <div className="space-y-2">
            <h4 className="type-h4 text-foreground">TagInput</h4>
            <PropsTable props={TAG_INPUT_PROPS} />
          </div>
        </div>
      </ShowcaseSubsection>
    </ShowcaseSection>
  );
}

/**
 * The stepper the three creation flows draw by hand. Reproduced here rather
 * than imported because it is not a component yet — that is the finding, and
 * showing it is what makes the duplication visible.
 */
function StepRail({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels: string[];
}) {
  return (
    <ol className="flex items-center">
      {Array.from({ length: total }, (_, index) => {
        const step = index + 1;
        const isDone = step < current;
        const isCurrent = step === current;
        return (
          <li key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full type-caption font-semibold',
                  isDone && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground ring-4 ring-primary/15',
                  !isDone && !isCurrent && 'border border-border bg-surface text-muted-foreground',
                )}
              >
                {step}
              </span>
              <span
                className={cn(
                  'type-caption whitespace-nowrap',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {labels[index]}
              </span>
            </div>
            {step < total && (
              <span
                className={cn('mx-2 h-0.5 flex-1', isDone ? 'bg-primary' : 'bg-border')}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
