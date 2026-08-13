import type { LucideIcon } from '@/design-system/icons';


/**
 * Navigation model.
 *
 * A single declarative tree in `src/config/navigation.ts` drives the sidebar,
 * the breadcrumb trail and the document title. Adding a module means adding one
 * entry here — never touching the layout components.
 */

export interface NavItem {
  /** Stable identifier, unique across the whole tree. */
  id: string;
  /** Label shown in the sidebar and used as the breadcrumb segment. */
  label: string;
  /**
   * Overrides `label` in the breadcrumb trail. Needed when a row reads
   * correctly under its group but not on its own — a module's landing child
   * called "Dashboard" would otherwise render "Dashboard › Dashboard › Cycles".
   */
  breadcrumbLabel?: string;
  /** Absolute route path. Omit for a group that only contains children. */
  path?: string;
  icon?: LucideIcon;
  /** Nested items, rendered as a collapsible group. */
  children?: NavItem[];
  /** Short count/state indicator rendered at the end of the row. */
  badge?: string | number;
  /** Renders the item as visible but non-interactive. */
  disabled?: boolean;
  /** Permission keys required to see the item. Enforced once auth exists (Phase 2). */
  permissions?: string[];
  /** Opt out of exact matching so child routes keep the parent highlighted. */
  matchNested?: boolean;
}

/** A labelled block of navigation items, rendered with an optional caption. */
export interface NavSection {
  id: string;
  /** Caption above the group; omit for an unlabelled block. */
  label?: string;
  items: NavItem[];
}

/** One resolved link in the breadcrumb trail. */
export interface BreadcrumbItem {
  label: string;
  /** Absent for the current page, which renders as plain text. */
  path?: string;
  isCurrent: boolean;
}
