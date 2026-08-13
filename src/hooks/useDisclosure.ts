import { useCallback, useState } from 'react';

interface UseDisclosureResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

/**
 * Boolean open/closed state for dialogs, drawers, menus and popovers.
 * Every callback is stable, so it is safe to pass into memoised children.
 */
export function useDisclosure(defaultOpen = false): UseDisclosureResult {
  const [isOpen, setOpen] = useState(defaultOpen);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((previous) => !previous), []);

  return { isOpen, open, close, toggle, setOpen };
}
