import { CompanyAvatar } from '@/design-system';
import { cn } from '@/utils';
import { customerInitials, getCustomerLogoUrl } from '../mocks/customerProfiles';

/**
 * A named company, shown the way the shipper console shows one: its mark, then
 * its name.
 *
 * The transporter's customers *are* shippers, and a carrier reading a delay
 * table recognises "Red Sea Cargo Group" by the logo they see on every booking
 * long before they finish reading the words. One component so a table cell, a
 * dashboard row and an offer card cannot draw the same company three ways —
 * and so a company that has no mark on file falls back to initials rather than
 * to a blank circle.
 */

export interface CompanyMarkProps {
  /** Customer id or company name — either resolves to the same mark. */
  id?: string;
  name: string;
  /** Overrides the customer lookup, for a company from another dimension. */
  logoUrl?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

/** The mark on its own, for a line that already carries the name inline. */
export function CompanyMark({ id, name, logoUrl, size = 'xs', className }: CompanyMarkProps) {
  return (
    <CompanyAvatar
      src={logoUrl ?? getCustomerLogoUrl(id) ?? getCustomerLogoUrl(name)}
      name={name}
      fallback={customerInitials(name)}
      size={size}
      shape="circle"
      className={cn('shrink-0', className)}
    />
  );
}

export interface CompanyLabelProps extends CompanyMarkProps {
  /** Muted is the table-cell default; the emphasised form is for card titles. */
  tone?: 'muted' | 'foreground' | 'primary';
  /** Overrides the tone when the surrounding line sets its own type. */
  textClassName?: string;
}

const TONE: Record<NonNullable<CompanyLabelProps['tone']>, string> = {
  muted: 'text-muted-foreground',
  foreground: 'font-medium text-foreground',
  primary: 'font-medium text-primary',
};

export function CompanyLabel({
  tone = 'muted',
  textClassName,
  className,
  ...mark
}: CompanyLabelProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <CompanyMark {...mark} />
      <span className={cn('truncate', textClassName ?? TONE[tone])}>{mark.name}</span>
    </span>
  );
}

export default CompanyLabel;
