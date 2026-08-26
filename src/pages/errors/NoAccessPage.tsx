import { Link } from 'react-router-dom';

import { EmptyState } from '@/components';
import { ROUTES } from '@/config/routes';
import { Button } from '@/design-system';
import { Lock } from '@/design-system/icons';
import { useDocumentTitle } from '@/hooks';
import { permissionLabel } from '@/features/access';

/**
 * 403, said plainly and inside the shell.
 *
 * Distinct from "Page not found" on purpose: this page exists, the account
 * simply may not open it. Naming the missing permission is what turns "the app
 * is broken" into a sentence an administrator can act on — it is the exact
 * string they tick in Administration › Access Profiles.
 */
export function NoAccessPage({ required = [] }: { required?: readonly string[] }) {
  useDocumentTitle('No access');

  return (
    <div className="flex-1 flex flex-col justify-center rounded-md border border-border bg-surface shadow-xs">
      <EmptyState
        size="lg"
        icon={Lock}
        title="You do not have access to this page"
        description={
          required.length > 0
            ? `It needs ${required.map(permissionLabel).join(' or ')}. Ask an administrator to add it to your access profile.`
            : 'Ask an administrator to grant your account access to this module.'
        }
        action={
          <Button asChild>
            <Link to={ROUTES.dashboard}>Back to Dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

export default NoAccessPage;
