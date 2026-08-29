import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The single source of button styling for the entire application.
 *
 * `Button`, `IconButton` and `ButtonGroup` all render from this one cva, so a
 * change to focus treatment or corner radius lands everywhere at once and no
 * component can drift into its own look.
 *
 * Rules enforced here:
 *   - every colour is a semantic token; no palette primitives, no opacity
 *     modifiers standing in for a missing state token
 *   - every variant declares default, hover and active
 *   - disabled styling is driven by both `:disabled` and `[aria-disabled]`,
 *     because an `asChild` anchor cannot carry the `disabled` attribute
 */

const BASE = [
  'relative inline-flex shrink-0 select-none items-center justify-center align-middle',
  'whitespace-nowrap font-medium',
  'transition-[color,background-color,border-color,box-shadow,opacity] duration-fast ease-out',

  // The ring is the only focus affordance, so it must never be removed.
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',

  // `aria-disabled` covers asChild links, which ignore the disabled attribute.
  'disabled:pointer-events-none disabled:opacity-50',
  'aria-disabled:pointer-events-none aria-disabled:opacity-50',

  // Icons never intercept the click, and never shrink in a tight row.
  '[&_svg]:pointer-events-none [&_svg]:shrink-0',
];

export const buttonVariants = cva(BASE, {
  variants: {
    variant: {
      primary: [
        'bg-primary text-primary-foreground shadow-xs',
        'hover:bg-primary-hover active:bg-primary-active',
      ],
      secondary: [
        'bg-secondary text-secondary-foreground',
        'hover:bg-secondary-hover active:bg-border-strong',
      ],
      outline: [
        'border border-border-strong bg-surface text-foreground shadow-xs',
        'hover:bg-muted active:bg-secondary',
      ],
      ghost: ['text-foreground', 'hover:bg-muted active:bg-secondary'],
      subtle: [
        'bg-primary-subtle text-primary-subtle-foreground',
        'hover:bg-primary-subtle/70 active:bg-primary-subtle',
      ],
      accent: [
        'bg-accent text-accent-foreground shadow-xs',
        'hover:bg-accent-hover active:bg-accent-active',
      ],
      /* `success` and `warning` were removed: both are *statuses*, not actions.
       * A button is a thing you do, and "this went well" is not one — that
       * belongs to Badge/StatusBadge. Neither had a single call site.
       *
       * `link` was removed too. It also had no product usage, and the pattern it
       * modelled is better served by `asChild`: <Button asChild variant="ghost">
       * wrapping a real <Link> is an actual anchor, so middle-click and
       * open-in-new-tab work and AT announces it as a link.
       *
       * `subtle` was kept despite being on the cut list — it is NOT a near-copy
       * of `secondary`. `subtle` is a brand tint (`bg-primary-subtle`) and
       * `secondary` is neutral gray, and 51 call sites rely on that difference. */
      destructive: [
        'bg-destructive text-destructive-foreground shadow-xs',
        'hover:bg-destructive-hover active:bg-destructive-active',
      ],
    },

    size: {
      xs: 'h-7 gap-1.5 rounded-sm px-2 text-xs [&_svg]:size-3.5',
      sm: 'h-8 gap-1.5 rounded-md px-3 text-sm [&_svg]:size-4',
      md: 'h-9 gap-2 rounded-md px-4 text-base [&_svg]:size-4',
      lg: 'h-10 gap-2 rounded-md px-5 text-md [&_svg]:size-4.5',
      xl: 'h-11 gap-2.5 rounded-lg px-6 text-lg [&_svg]:size-5',
      /** Square, medium. Shorthand for the most common icon-only button. */
      icon: 'size-9 gap-0 rounded-md p-0 [&_svg]:size-4',
    },

    /** Squares the control at whatever size is active. */
    iconOnly: {
      true: 'gap-0 p-0',
      false: '',
    },

    shape: {
      default: '',
      pill: 'rounded-full',
    },

    fullWidth: {
      true: 'w-full',
      false: '',
    },
  },

  compoundVariants: [
    // Square dimensions per size. Declared as compounds rather than as separate
    // `icon-sm`/`icon-lg` sizes so the size scale stays one axis.
    { iconOnly: true, size: 'xs', class: 'w-7' },
    { iconOnly: true, size: 'sm', class: 'w-8' },
    { iconOnly: true, size: 'md', class: 'w-9' },
    { iconOnly: true, size: 'lg', class: 'w-10' },
    { iconOnly: true, size: 'xl', class: 'w-11' },
  ],

  defaultVariants: {
    variant: 'primary',
    size: 'md',
    iconOnly: false,
    shape: 'default',
    fullWidth: false,
  },
});

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

/** Visual style of a button. */
export type ButtonVariant = NonNullable<ButtonVariantProps['variant']>;

/** Size step. `icon` is shorthand for a square medium button. */
export type ButtonSize = NonNullable<ButtonVariantProps['size']>;

/* ---------------------------------------------------------------------------
 * rowCardActionClasses
 * ---------------------------------------------------------------------------
 * The "View" button on a row card — the one that lights up teal when the CARD
 * is hovered, not just the button.
 *
 * ## Why the direct-hover classes are spelled out
 *
 * The button sits inside the card's `group`, so pointing at the button is also
 * a group hover and BOTH rule sets fire at once. The variant then painted the
 * background (`hover:bg-muted`, a pale grey) while `group-hover:` painted the
 * text (`text-primary-foreground`, white) — two rules of equal specificity
 * deciding two halves of the same button, and they disagreed. The result was
 * white type on a pale grey fill: the button disappeared at the exact moment
 * you pointed at it.
 *
 * Naming `hover:bg-*` and `hover:text-*` here fixes it deterministically rather
 * than by luck of stylesheet order, because `cn` runs `twMerge`: a `hover:`
 * background in `className` *removes* the variant's instead of racing it. The
 * direct hover is deliberately one step deeper than the card hover, so moving
 * from the card onto the button still reads as a change. `active:` is spelled
 * out for the same reason — the variant's grey would have flashed under white
 * type on every click.
 *
 * Use it for any row-card action, and do not re-hand-roll the group-hover
 * classes: this bug shipped twice, in two modules, from the same six-class
 * incantation being copied.
 * ------------------------------------------------------------------------- */
export const rowCardActionClasses = [
  'border-border/80 transition cursor-pointer shrink-0',
  'group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground',
  'hover:border-primary hover:bg-primary-hover hover:text-primary-foreground',
  'active:bg-primary-active active:text-primary-foreground',
].join(' ');
