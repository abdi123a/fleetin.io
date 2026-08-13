import { RadiusSpecimen, ShowcaseGrid, ShowcaseSection } from '@/design-system/showcase';

import { RADIUS_TOKENS } from '../catalog/foundations.catalog';

/**
 * Section 3 — Radius.
 */
export function RadiusSection() {
  return (
    <ShowcaseSection
      id="radius"
      index="03"
      title="Radius"
      description="Corner radii, from flush to fully round. Controls use Medium, panels use Card, anything drawn inside a panel steps down to Card Nested, and pills use Full. The previews show a magnified top edge because small radii are indistinguishable on a fully rounded box."
    >
      <ShowcaseGrid minColumnWidth="14rem">
        {RADIUS_TOKENS.map((radius) => (
          <RadiusSpecimen
            key={radius.token}
            name={radius.name}
            token={radius.token}
            utility={radius.utility}
            usage={radius.usage}
          />
        ))}
      </ShowcaseGrid>
    </ShowcaseSection>
  );
}
