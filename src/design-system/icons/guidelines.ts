import type { IconSize } from './types';

/**
 * FLEETIN Icon System Guidelines
 */

export interface IconSizeGuideline {
  size: IconSize;
  tailwindClass: string;
  pixels: string;
  useCase: string;
}

export const ICON_SIZES: IconSizeGuideline[] = [
  {
    size: 16,
    tailwindClass: 'size-4',
    pixels: '16px',
    useCase: 'Small controls, inline badges, dense data table actions, and metadata tags.',
  },
  {
    size: 18,
    tailwindClass: 'size-[18px]',
    pixels: '18px',
    useCase: 'Compact buttons, input adornments, and secondary action bars.',
  },
  {
    size: 20,
    tailwindClass: 'size-5',
    pixels: '20px',
    useCase: 'Default size. Standard buttons, sidebar navigation items, and form fields.',
  },
  {
    size: 24,
    tailwindClass: 'size-6',
    pixels: '24px',
    useCase: 'Section headers, page header titles, modal titles, and prominent cards.',
  },
  {
    size: 32,
    tailwindClass: 'size-8',
    pixels: '32px',
    useCase: 'Empty states, hero callouts, metric card accents, and feature highlights.',
  },
];

export const ICON_RULES = {
  strokeWidth: 2,
  colorInheritance: 'Icons must inherit current text color (currentColor). Do not hardcode HEX or RGB values.',
  semanticTokens: 'Use semantic color tokens such as text-muted-foreground, text-primary, text-status-success, text-status-error.',
  accessibility: {
    decorative: 'Use aria-hidden="true" when an icon is accompanied by visible descriptive text.',
    interactive: 'Provide aria-label or visually hidden text when an icon button has no visible label.',
  },
};
