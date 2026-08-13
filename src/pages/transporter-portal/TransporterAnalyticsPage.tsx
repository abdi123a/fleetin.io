import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { TransporterAnalyticsSuite } from './TransporterAnalyticsSuite';
import { isTransporterTabKey, type TransporterTabKey } from './components/TransporterTabNav';

/**
 * Full transporter analytics — the deep BI suite, parallel to shipper `/analytics`.
 * Subject tabs are owned via `?tab=` so the sidebar can deep-link into Fleet,
 * Drivers, Payments, and the rest.
 */
export function TransporterAnalyticsPage() {
  const user = useAuthStore((state) => state.user);
  const transporterId = user?.transporterId || 'TRP-01';
  const companyName = user?.companyName || 'Red Sea Express Ltd';

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TransporterTabKey = isTransporterTabKey(rawTab) ? rawTab : 'overview';

  const handleTabChange = useCallback(
    (next: TransporterTabKey) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current);
        if (next === 'overview') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams],
  );

  return (
    // `w-full min-w-0` is load-bearing, not decoration: `mx-auto` sets auto
    // cross-axis margins, which switch a flex child off `stretch` and size it
    // to its content instead. Without them this column measures itself against
    // the widest table inside it and runs off the side of a phone.
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Business intelligence</p>
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
            {companyName} — Analytics
          </h1>
        </div>
      </div>

      <TransporterAnalyticsSuite
        transporterId={transporterId}
        tab={tab}
        onTabChange={handleTabChange}
      />
    </div>
  );
}

export default TransporterAnalyticsPage;
