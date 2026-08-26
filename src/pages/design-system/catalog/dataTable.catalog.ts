import type { Guideline, PropDefinition } from '@/design-system/showcase';

/**
 * Reference content for the Tables section.
 *
 * Only props with a real usage precedent are listed. `EnterpriseDataTable` has
 * no live call site in the product right now — the shipper account's shipments
 * tab, its one consumer, was rebuilt on the same `ShipmentsListView` the Admin
 * Shipments page uses, in favour of one row-card design over two. The rows
 * below are that former call site's props, plus the column `meta` keys those
 * columns set. Everything the component can do but nothing calls is named
 * once, in prose, rather than documented as a pattern.
 */

/* ---------------------------------------------------------------------------
 * Component APIs
 * ------------------------------------------------------------------------ */

export const ENTERPRISE_DATA_TABLE_PROPS: PropDefinition[] = [
  {
    name: 'data',
    type: 'TData[]',
    required: true,
    description: 'The full dataset. Sorting, search and paging all run in the browser over this array.',
  },
  {
    name: 'columns',
    type: 'ColumnDef<TData, unknown>[]',
    required: true,
    description: 'Standard TanStack Table column definitions. Define them at module scope or in a useMemo so the array identity is stable.',
  },
  {
    name: 'getRowId',
    type: '(row: TData, index: number) => string',
    description: 'Stable row identity. Without it TanStack falls back to the array index, so a sort or a refetch reassigns every row key.',
  },
  {
    name: 'density',
    type: "'compact' | 'comfortable' | 'spacious'",
    defaultValue: "'comfortable'",
    description: 'Row height. Passing it pins the value: the toolbar still shows a density menu, but the prop wins, so the menu does nothing. Pass it only when you mean to fix the density.',
  },
  {
    name: 'stickyHeader',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Pins the header row inside a scrolling container of bounded height.',
  },
  {
    name: 'maxBodyHeight',
    type: 'string | number',
    defaultValue: "'32rem'",
    description: 'Height of that scroll container. Only has an effect together with stickyHeader.',
  },
  {
    name: 'responsive',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Below the md breakpoint each row is stacked as a card built from the same column definitions, labelled by meta.label. There is no second column array to maintain.',
  },
  {
    name: 'searchPlaceholder',
    type: 'string',
    description: 'Placeholder for the toolbar search box. The search box itself is on by default and filters across all columns.',
  },
  {
    name: 'onRowClick',
    type: '(row: TData) => void',
    description: 'Makes rows clickable and gives them a pointer cursor. This is how a table row opens a detail view.',
  },
  {
    name: 'caption',
    type: 'string',
    description: 'Visually-hidden <caption> naming the table for screen readers. Pass one whenever a nearby heading does not already name it.',
  },
  {
    name: 'emptyState / noResultsState',
    type: 'Partial<DataTableEmptyStateProps>',
    description: 'Overrides the title, description and icon of the two states a client-mode table reaches: no data at all, and no rows matching the current search.',
  },
];

export const COLUMN_META_PROPS: PropDefinition[] = [
  {
    name: 'label',
    type: 'string',
    description: 'Names the column in the Column Manager and in the responsive row card. Falls back to the header string, which breaks as soon as the header is a node rather than text.',
  },
  { name: 'align', type: "'left' | 'center' | 'right'", defaultValue: "'left'", description: 'Aligns the header and every cell in the column. Use it for numeric columns.' },
  { name: 'width', type: 'number', description: 'Pixel width hint for the column.' },
  { name: 'cellClassName', type: 'string', description: 'Classes merged onto every cell in the column.' },
  { name: 'headerClassName', type: 'string', description: 'Classes merged onto the header cell.' },
];

export const TABLE_PRIMITIVE_PROPS: PropDefinition[] = [
  { name: 'TableRoot', type: 'HTMLAttributes<HTMLTableElement>', description: 'The <table> itself — full width, collapsed borders, caption at the bottom. Put the horizontal-scroll wrapper around it, never on the page body.' },
  { name: 'TableCaption', type: 'HTMLAttributes<HTMLElement>', description: 'Rendered visually and read by screen readers. It is the accessible name of the table.' },
  { name: 'TableHeader / TableBody / TableFooter', type: 'HTMLAttributes<HTMLTableSectionElement>', description: 'The three sections, each carrying the divider rules so rows do not have to.' },
  { name: 'TableRow', type: '{ selected?: boolean; clickable?: boolean }', description: 'selected tints the row with primary-subtle and sets data-state="selected"; clickable only adds the pointer cursor — you still wire the handler.' },
  { name: 'TableHead / TableCell', type: "{ align?: 'left' | 'center' | 'right'; sticky?: 'left' | 'right'; stickyOffset?: number }", description: 'align sets text alignment. sticky pins the column against the named edge while the wrapper scrolls sideways, offset by stickyOffset pixels.' },
];

/* ---------------------------------------------------------------------------
 * Guidelines / notes
 * ------------------------------------------------------------------------ */

export const DATA_TABLE_GUIDELINES: Guideline[] = [
  {
    do: 'Reach for EnterpriseDataTable when the table needs search, sorting, paging and column hiding at once — it brings all four and a toolbar for free.',
    dont: 'Adopt it for a fixed twelve-row summary. The toolbar and pager are then chrome around nothing, and the Table primitives give the same styling with no machinery.',
  },
  {
    do: 'Pass `getRowId` whenever rows have a stable identifier.',
    dont: 'Rely on the array index as row identity — it changes the moment the data is sorted or refetched.',
  },
  {
    do: 'Keep `columns` defined outside render — module scope, or a `useMemo` with a stable dependency list.',
    dont: 'Build the array inline in the component body; TanStack rebuilds its internal column and header structures every time the identity changes.',
  },
  {
    do: 'Set `meta.label` on every column, and `meta.align: "right"` on numeric ones.',
    dont: 'Leave `meta.label` off a column whose header is a node rather than a plain string — the Column Manager and the responsive card have nothing left to call it.',
  },
];

export const DATA_TABLE_ACCESSIBILITY: string[] = [
  'Both shapes render a real <table> with <thead>, <tbody> and <th scope="col">, so screen readers announce row and column position without any role or tabIndex retrofitting.',
  'Sortable headers in EnterpriseDataTable are real <button> elements, so they are focusable and activatable from the keyboard with no extra work.',
  'The empty and no-results states replace the rows with a labelled message rather than an ambiguous blank table.',
  'Pass `caption` (EnterpriseDataTable) or a `<TableCaption>` (primitives) whenever an adjacent heading does not already name the table.',
];

export const DATA_TABLE_KEYBOARD: string[] = [
  'Tab and Shift+Tab move between the search box, the column headers and the pagination controls in DOM order.',
  'Enter or Space toggles sorting on a focused column header.',
  'Arrow keys, Enter and Escape inside the Column Manager follow the Radix DropdownMenu pattern, which owns focus trapping and returning focus to the trigger.',
];

export const DATA_TABLE_PERFORMANCE: string[] = [
  'Client mode computes the sorted, filtered and paginated row models through TanStack\'s memoised pipeline, so recomputation is scoped to the models that actually changed.',
  'Only the current page is mounted: `getPaginationRowModel` slices before render, so a large client dataset still renders one page of rows at a time.',
  'The table shell is deliberately unvirtualized — plain DOM rows. `useEnterpriseTable` keeps row-model logic separate from rendering so virtualization, if it is ever needed, touches only the body renderer and no consuming page.',
  'Prefer `getRowId` over the default index id: the same id becomes React\'s key, letting rows that have not changed skip re-rendering.',
];
