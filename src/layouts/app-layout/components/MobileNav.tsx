import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/design-system';

import { Sidebar } from './Sidebar';

/**
 * MobileNav — the sidebar presented as an overlay drawer below `lg`.
 *
 * Reuses `Sidebar` rather than duplicating navigation markup; it is always
 * rendered expanded, since a rail inside a drawer serves no purpose.
 *
 * Radix Dialog requires an accessible title and description — both are visually
 * hidden because the panel's own branding is the visible heading.
 */

export interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after navigating, so the drawer closes behind the transition. */
  onNavigate: () => void;
}

export function MobileNav({ isOpen, onOpenChange, onNavigate }: MobileNavProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 gap-0 p-0" hideCloseButton>
        <VisuallyHidden asChild>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden>
        <VisuallyHidden asChild>
          <SheetDescription>Application modules and settings</SheetDescription>
        </VisuallyHidden>

        <Sidebar isCollapsed={false} onNavigate={onNavigate} />
      </SheetContent>
    </Sheet>
  );
}
