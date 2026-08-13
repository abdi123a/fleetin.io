import { Users } from '@/design-system/icons';


import { PlaceholderPage } from '@/pages/PlaceholderPage';

/**
 * Employees module.
 *
 * Phase 1 registers the route and its place in the shell. The module's real
 * screens replace the placeholder body in Phase 2 without moving this file or
 * touching the router.
 */
export function EmployeesPage() {
  return (
    <PlaceholderPage
      title="Employees"
      description="Internal staff directory, roles and reporting lines."
      icon={Users}
      upcoming="Employee directory, role assignment and org structure are delivered in Phase 2."
    />
  );
}

export default EmployeesPage;
