import { useAuthStore } from '@/stores';
import { useShipper } from '@/features/shippers/api/queries';
import { ShipperAnalyticsSuite } from './ShipperAnalyticsSuite';

/**
 * Portal entry point for shipper analytics: binds the BI suite to the
 * signed-in shipper's account and supplies the page frame around it. The
 * layout rationale lives on {@link ShipperAnalyticsSuite}, which the admin's
 * shipper detail page mounts for arbitrary shippers.
 */
export function AnalyticsPage() {
  const user = useAuthStore((state) => state.user);
  const shipperId = user?.shipperId ?? '';
  const { data: shipper } = useShipper(shipperId);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Business intelligence</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
            {shipper?.companyLegalName ?? 'Loading…'} — Analytics
          </h1>
        </div>
      </div>

      <ShipperAnalyticsSuite shipperId={shipperId} />
    </div>
  );
}

export default AnalyticsPage;
