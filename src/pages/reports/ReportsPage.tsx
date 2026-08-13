import { BarChart3 } from '@/design-system/icons';


import { PlaceholderPage } from '@/pages/PlaceholderPage';

/**
 * Reports module.
 *
 * Phase 1 registers the route and its place in the shell. The module's real
 * screens replace the placeholder body in Phase 2 without moving this file or
 * touching the router.
 */
export function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Operational and financial reporting across every module."
      icon={BarChart3}
      upcoming="Report builder, scheduled exports and analytics dashboards are delivered in Phase 2."
    />
  );
}

export default ReportsPage;
