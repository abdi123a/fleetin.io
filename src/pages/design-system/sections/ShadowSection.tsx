import { ShadowSpecimen, ShowcaseGrid, ShowcaseSection } from '@/design-system/showcase';

import { SHADOW_TOKENS } from '../catalog/foundations.catalog';

/**
 * Section 4 — Shadows.
 */
export function ShadowSection() {
  return (
    <ShowcaseSection
      id="shadows"
      index="04"
      title="Shadows"
      description="Elevation is expressed through the shadow scale in the light theme. The dark theme flattens most of the ramp and separates layers by surface lightness instead, because a soft shadow on a dark canvas reads as noise rather than height — switch the theme to see the values change. Card is the one every dashboard panel uses, and the one that swaps most: in dark mode it trades its drop shadow for a 1px ring."
    >
      <ShowcaseGrid minColumnWidth="16rem">
        {SHADOW_TOKENS.map((shadow) => (
          <ShadowSpecimen
            key={shadow.token}
            name={shadow.name}
            token={shadow.token}
            utility={shadow.utility}
            usage={shadow.usage}
          />
        ))}
      </ShowcaseGrid>
    </ShowcaseSection>
  );
}
