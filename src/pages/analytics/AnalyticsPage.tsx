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
    <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-5 px-4 pb-12 pt-1 sm:px-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
          Analytics
        </h1>
        {/* The account is named once, in the one line that says what the page
            covers. The old header said it twice — an eyebrow reading "Business
            intelligence" above a heading ending in "— Analytics", for a page
            the sidebar had already labelled Analytics. */}
        <p className="type-body-sm mt-1 text-muted-foreground">
          Everything {shipper?.companyLegalName ?? 'your account'} has shipped, over time.
        </p>
      </div>

      <ShipperAnalyticsSuite shipperId={shipperId} />
    </div>
  );
}

export default AnalyticsPage;
