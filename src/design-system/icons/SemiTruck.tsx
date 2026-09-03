import type { FC, SVGProps } from 'react';

/**
 * The truck Fleetin actually runs: a tractor pulling a container box.
 *
 * No icon in the app's own set is this vehicle. Lucide's `Truck` is a rigid
 * box van and its `Container` is a shipping box with no vehicle under it —
 * both were standing in for the only kind of truck on this corridor, and an
 * icon showing the wrong vehicle is worse than a generic one because it looks
 * deliberate.
 *
 * Hugeicons' `container-truck-01`, copied in the way the rest of this folder
 * copies things rather than pulling a second icon library in for one glyph.
 * Chosen over the alternatives after drawing them all at the size they are
 * actually used:
 *
 *  - Their `semi-truck` is the most literally correct — a real articulated
 *    tractor and trailer — and it is mud at 18px. Detail that cannot survive
 *    the chip is detail that costs legibility for nothing.
 *  - `shipping-truck-02` reads cleanly but is a plain box: the same silhouette
 *    as a parcel van.
 *  - This one keeps the two ribs on the box, which is what makes it a
 *    *container* rather than a body — the right distinction for a fleet whose
 *    every truck is measured in 20ft and 40ft — and still resolves at 18px.
 *
 * A hand-drawn attempt came first and was rejected: at this size an icon is
 * mostly proportion and joinery, and a set that has solved both beats a
 * silhouette traced from a photograph.
 *
 * `1.7` stroke rather than Hugeicons' native `1.5`: it sits beside lucide's
 * `2` everywhere it is used, and at 1.5 it read as a lighter weight of icon
 * rather than the same one.
 */
export const SemiTruck: FC<SVGProps<SVGSVGElement>> = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    className={className}
    {...props}
  >
    {/* The wheels. */}
    <path d="M19.5 17.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0Zm-10 0a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0Z" />
    {/* The box, the cab, the chassis between them — and the two ribs that make
        the box a container. */}
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.5 17.5h-5m10 0h.763c.22 0 .33 0 .422-.012a1.5 1.5 0 0 0 1.303-1.302c.012-.093.012-.203.012-.423V13a6.5 6.5 0 0 0-6.5-6.5m-.5 9V7c0-1.414 0-2.121-.44-2.56C14.122 4 13.415 4 12 4H5c-1.414 0-2.121 0-2.56.44C2 4.878 2 5.585 2 7v8c0 .935 0 1.402.201 1.75a1.5 1.5 0 0 0 .549.549c.348.201.815.201 1.75.201M6.5 7v4m4-4v4"
    />
  </svg>
);

SemiTruck.displayName = 'SemiTruck';
