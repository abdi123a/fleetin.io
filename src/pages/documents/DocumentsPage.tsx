import { FileText } from '@/design-system/icons';


import { PlaceholderPage } from '@/pages/PlaceholderPage';

/**
 * Documents module.
 *
 * Phase 1 registers the route and its place in the shell. The module's real
 * screens replace the placeholder body in Phase 2 without moving this file or
 * touching the router.
 */
export function DocumentsPage() {
  return (
    <PlaceholderPage
      title="Documents"
      description="Central repository for operational and compliance documents."
      icon={FileText}
      upcoming="Document upload, categorisation and expiry monitoring are delivered in Phase 2."
    />
  );
}

export default DocumentsPage;
