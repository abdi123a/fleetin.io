import { Compass } from '@/design-system/icons';

import { Link } from 'react-router-dom';

import { EmptyState } from '@/components';
import { ROUTES } from '@/config/routes';
import { Button } from '@/design-system';
import { useDocumentTitle } from '@/hooks';

/**
 * 404 — rendered inside the shell, so the user keeps their navigation and can
 * recover without a back-button round trip.
 */
export function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="flex-1 flex flex-col justify-center rounded-md border border-border bg-surface shadow-xs">
      <EmptyState
        size="lg"
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist, or has been moved to a different module."
        action={
          <Button asChild>
            <Link to={ROUTES.dashboard}>Back to Dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}

export default NotFoundPage;
