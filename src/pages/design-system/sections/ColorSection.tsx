import {
  ColorSwatch,
  ShowcaseGrid,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';

import { COLOR_GROUPS, SPECIALISED_COLOR_NOTE } from '../catalog/colors.catalog';

/**
 * Section 1 — Colours.
 *
 * Every swatch reads its value from the live stylesheet, so switching the theme
 * re-reports the palette rather than showing stale light-theme hexes. Kept to
 * the small set of roles a screen-builder reaches for constantly — states and
 * surface-specific roles are named in prose rather than given their own card.
 */
export function ColorSection() {
  return (
    <ShowcaseSection
      id="colors"
      index="01"
      title="Colours"
      description="The core palette — every colour a screen reaches for by default. Tailwind's default palette is cleared, so an unlisted colour utility silently renders nothing; use a role instead. Roles resolve per theme, so the hexes below are this theme's answer, not fixed values."
    >
      {COLOR_GROUPS.map((group) => (
        <ShowcaseSubsection
          key={group.id}
          title={group.title}
          description={group.description}
          aside={`${group.colors.length} tokens`}
        >
          <ShowcaseGrid minColumnWidth="15rem">
            {group.colors.map((color) => (
              <ColorSwatch
                key={`${group.id}-${color.token}-${color.utility}`}
                name={color.name}
                token={color.token}
                utility={color.utility}
                preview={color.preview}
                usage={color.usage}
                pairedForeground={color.pairedForeground}
              />
            ))}
          </ShowcaseGrid>
        </ShowcaseSubsection>
      ))}

      <p className="type-body-sm text-muted-foreground">{SPECIALISED_COLOR_NOTE}</p>
    </ShowcaseSection>
  );
}
