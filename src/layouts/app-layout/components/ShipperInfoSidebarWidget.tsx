import { Building2, ShieldCheck, Mail, MapPin } from '@/design-system/icons';
import { Badge, Tooltip } from '@/design-system';
import { useAuthStore } from '@/stores';
import { useShipper } from '@/features/shippers/api/queries';

export interface ShipperInfoSidebarWidgetProps {
  isCollapsed: boolean;
}

export function ShipperInfoSidebarWidget({ isCollapsed }: ShipperInfoSidebarWidgetProps) {
  const user = useAuthStore((state) => state.user);

  const { data: shipper } = useShipper(user?.shipperId);

  if (!shipper) return null;

  if (isCollapsed) {
    return (
      <div className="my-2 flex justify-center px-2">
        <Tooltip
          content={
            <div className="flex flex-col gap-1 p-1 text-xs">
              <p className="font-semibold text-foreground">{shipper.companyLegalName}</p>
              <p className="text-muted-foreground">{shipper.reference ?? shipper.id} • {shipper.industry}</p>
              <p className="text-[11px] text-muted-foreground/80">Contact: {shipper.primaryContact.name}</p>
            </div>
          }
          side="right"
        >
          <div className="relative flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 transition hover:bg-primary/15">
            {shipper.logoUrl ? (
              <img
                src={shipper.logoUrl}
                alt={shipper.companyLegalName}
                className="size-7 rounded-md object-cover"
              />
            ) : (
              <Building2 className="size-5" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-sidebar bg-success" />
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="mx-3 my-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 text-sidebar-foreground shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
          {shipper.logoUrl ? (
            <img
              src={shipper.logoUrl}
              alt={shipper.companyLegalName}
              className="size-7 rounded-md object-cover"
            />
          ) : (
            <Building2 className="size-5" />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-sidebar bg-success" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="truncate text-xs font-bold leading-tight text-foreground" title={shipper.companyLegalName}>
              {shipper.companyLegalName}
            </h4>
            <Badge intent="success" size="sm" className="shrink-0 text-[9px] px-1.5 py-0">
              <ShieldCheck className="mr-0.5 size-2.5 inline" />
              {shipper.approvalStatus || 'Verified'}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono font-medium text-foreground/90">{shipper.reference ?? shipper.id}</span>
            <span>•</span>
            <span className="truncate">{shipper.industry}</span>
          </div>

          <div className="pt-1 border-t border-sidebar-border/60 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1 truncate">
              <Mail className="size-3 text-primary shrink-0" />
              <span className="truncate" title={shipper.primaryContact.email}>{shipper.primaryContact.name} ({shipper.primaryContact.email})</span>
            </div>
            <div className="flex items-center gap-1 truncate">
              <MapPin className="size-3 text-muted-foreground/70 shrink-0" />
              <span className="truncate">{shipper.country}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
