import { Settings } from '@/design-system/icons';


import { PlaceholderPage } from '@/pages/PlaceholderPage';

/**
 * Settings module.
 *
 * Phase 1 registers the route and its place in the shell. The module's real
 * screens replace the placeholder body in Phase 2 without moving this file or
 * touching the router.
 */
export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Workspace configuration and personal preferences."
      icon={Settings}
      upcoming="Organisation settings, notification preferences and integrations are delivered in Phase 2."
    />
  );
}

export default SettingsPage;
