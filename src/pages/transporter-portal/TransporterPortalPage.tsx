import { Navigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@/config/routes';

/**
 * Legacy `/transporter-portal` entry — redirects to the dashboard or analytics
 * deep-link so old bookmarks and `?tab=` links keep working.
 */
export function TransporterPortalPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const target = tab
    ? `${ROUTES.transporterAnalytics}?tab=${encodeURIComponent(tab)}`
    : ROUTES.transporterDashboard;
  return <Navigate to={target} replace />;
}

export default TransporterPortalPage;
