import { ChevronDown } from '@/design-system/icons';

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from 'react';

import { IconButton } from '@/design-system/primitives/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/design-system/primitives/Collapsible';
import { cn } from '@/utils';

import { FormDivider } from './FormDivider';

export interface FormSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Section title. */
  title?: ReactNode;

  /** Section description text. */
  description?: ReactNode;
  /** Header action nodes (e.g. secondary buttons, badges). */
  actions?: ReactNode;
  /** Optional top divider line. Default is false. */
  divider?: boolean;
  /** Allow section to be collapsed by user. Default is false. */
  collapsible?: boolean;
  /** Initial collapsed state when collapsible is true. Default is false (open). */
  defaultOpen?: boolean;
  /** Vertical spacing scale inside section. Default is 'md'. */
  spacing?: 'sm' | 'md' | 'lg';
}

const spacingClasses = {
  sm: 'space-y-3',
  md: 'space-y-4',
  lg: 'space-y-6',
};

export const FormSection = forwardRef<HTMLDivElement, FormSectionProps>(function FormSection(
  {
    title,
    description,
    actions,
    divider = false,
    collapsible = false,
    defaultOpen = true,
    spacing = 'md',
    className,
    children,
    ...props
  },
  ref,
) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const headerContent = (title || description || actions) && (
    <div className="flex items-start justify-between gap-4 pb-2">
      <div className="space-y-1">
        {title && (
          <h3 className="type-body-lg text-foreground flex items-center gap-2">
            {title}
          </h3>
        )}
        {description && <p className="type-body-xs text-muted-foreground">{description}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {collapsible && (
          <CollapsibleTrigger asChild>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')}
              />
            </IconButton>
          </CollapsibleTrigger>
        )}
      </div>
    </div>
  );


  const sectionBody = <div className={spacingClasses[spacing]}>{children}</div>;

  return (
    <div ref={ref} className={cn('w-full', className)} {...props}>
      {divider && <FormDivider />}

      {collapsible ? (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-4">
          {headerContent}
          <CollapsibleContent>{sectionBody}</CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="space-y-4">
          {headerContent}
          {sectionBody}
        </div>
      )}
    </div>
  );
});
