/**
 * The pager moved to `@/components/common/TablePager` once the Empty Return
 * Cycles board needed the same one. This file stays as the transporter
 * suite's import path so nothing here had to change.
 */
export {
  TABLE_PAGE_SIZE,
  TABLE_PAGE_SIZE_OPTIONS,
  TablePager,
  usePagedRows,
  type PagedRows,
  type TablePagerProps,
} from '@/components/common/TablePager';
