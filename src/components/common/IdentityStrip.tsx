import type { ReactNode } from 'react';

import { companyInitials } from '@/data/emptyReturnData';
import { CompanyAvatar } from '@/design-system';
import { useCompanyLogo } from '@/features/companies/companyLogos';
import { cn } from '@/utils';

/**
 * The strip that says who is on a job.
 *
 * Built for the mission report and adopted by the empty-return dialog, which
 * had been saying the same thing as a run-on line of 10px grey text: "Shipper
 * Amina FZCO  Transporter Dita Transit ★★★ 3.4  Truck DT-2162-DJ". Everything
 * there was the same weight, so the names — the only part anyone reads — had
 * to be hunted for. Here the label is small and quiet, the value is bold, and
 * only the two companies carry a mark, which is what makes them read as the
 * parties and the rest as detail.
 */

/** A named party: its own mark, then its name. Nothing else — the contact
    behind a company is not what identifies it. */
export function PartyName({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  /** Anything that qualifies the party itself — a rating, a state tag. */
  children?: ReactNode;
}) {
  const logo = useCompanyLogo(name);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CompanyAvatar
        src={logo}
        name={name}
        fallback={companyInitials(name)}
        size="md"
        shape="circle"
        className="shrink-0"
      />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-[12.5px] font-bold leading-tight text-foreground">{name}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A labelled fact with no mark — deliberately quieter than a party. */
export function IdentityFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          'truncate text-[12.5px] font-semibold leading-tight text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** The row the two live in: wraps, ruled off from whatever sits above it. */
export function IdentityStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-border/60 pt-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
