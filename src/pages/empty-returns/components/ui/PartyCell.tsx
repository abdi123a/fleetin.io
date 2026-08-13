import { ArrowLeftRight } from '@/design-system/icons';
import { Tooltip } from '@/design-system';
import { companyInitials } from '@/data/emptyReturnData';
import { cn } from '@/utils';

import { orgTintClass } from './urgencyTokens';

export interface PartyCellProps {
  company: string;
  counterparty: string;
  /** When mid-width, location rides as a suffix on the company line. */
  locationSuffix?: string | null;
  className?: string;
}

function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-bold shadow-2xs',
        orgTintClass(name),
      )}
    >
      {companyInitials(name)}
    </span>
  );
}

function TruncatableName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const needsTooltip = name.length > 26;
  const text = (
    <span
      className={cn(
        'min-w-0 truncate',
        className,
      )}
    >
      {name}
    </span>
  );
  if (!needsTooltip) return text;
  return <Tooltip content={name}>{text}</Tooltip>;
}

/**
 * Clean dual-party presentation:
 * - Top: Client / Shipper with monogram
 * - Bottom: Transporter / Carrier with truck icon
 */
export function PartyCell({ company, counterparty, locationSuffix, className }: PartyCellProps) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center gap-1', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Monogram name={company} />
        <div className="flex min-w-0 items-center gap-1">
          <TruncatableName
            name={company}
            className="text-xs font-semibold text-foreground tracking-tight"
          />
          {locationSuffix ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              · {locationSuffix}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 pl-0.5 text-muted-foreground">
        <ArrowLeftRight className="size-2.5 shrink-0 text-muted-foreground/60" aria-hidden />
        <Monogram name={counterparty} />
        <TruncatableName
          name={counterparty}
          className="text-[11px] font-normal text-muted-foreground"
        />
      </div>
    </div>
  );
}

