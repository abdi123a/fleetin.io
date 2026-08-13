/**
 * Design-system showcase components.
 *
 * Documentation infrastructure — the reusable pieces the `/design-system` page
 * is assembled from. Deliberately NOT re-exported from `@/design-system`: the
 * showcase is only ever imported by the lazily loaded design-system route, and
 * folding it into the main barrel would pull documentation code into every
 * bundle that touches a primitive.
 *
 * Import from `@/design-system/showcase`.
 */

export { ColorSwatch, type ColorSwatchPreview, type ColorSwatchProps } from './ColorSwatch';
export { CopyableToken, type CopyableTokenProps } from './CopyableToken';
export { formatColorValue } from './formatColor';
export { GuidelineList, type Guideline, type GuidelineListProps } from './GuidelineList';
export { IconTile, type IconTileProps } from './IconTile';
export { PropsTable, type PropDefinition, type PropsTableProps } from './PropsTable';
export {
  ShowcaseExample,
  ShowcaseItem,
  type ShowcaseExampleProps,
} from './ShowcaseExample';
export { RadiusSpecimen, type RadiusSpecimenProps } from './RadiusSpecimen';
export { ShadowSpecimen, type ShadowSpecimenProps } from './ShadowSpecimen';
export {
  ShowcaseGrid,
  ShowcasePanel,
  ShowcaseSection,
  ShowcaseSubsection,
  SpecRow,
  type ShowcaseGridProps,
  type ShowcasePanelProps,
  type ShowcaseSectionProps,
  type ShowcaseSubsectionProps,
  type SpecRowProps,
} from './ShowcaseSection';
export { SpacingSpecimen, type SpacingSpecimenProps } from './SpacingSpecimen';
export { TypeSpecimen, type TypeSpecimenProps } from './TypeSpecimen';
export { useTokenValue, useTokenValues } from './useTokenValues';
