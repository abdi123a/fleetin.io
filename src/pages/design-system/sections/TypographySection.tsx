import { ShowcasePanel, ShowcaseSection, TypeSpecimen } from '@/design-system/showcase';

import { TYPE_LEVELS } from '../catalog/foundations.catalog';

/**
 * Section 2 — Typography.
 *
 * Each level renders in its own style and reports metrics measured off the
 * rendered node, so the specification cannot disagree with the specimen.
 */
export function TypographySection() {
  return (
    <ShowcaseSection
      id="typography"
      index="02"
      title="Typography"
      description="Inter Variable at a 14px base, tuned for dense operational screens. Each level locks size, line height, weight and tracking together — apply the level class rather than assembling those four values by hand. Colour is never part of a level; pair it with a text colour token. Body Small and Body XS carry the console screens; the display levels appear once or twice in the whole product."
    >
      <ShowcasePanel padding="flush">
        <div className="divide-y divide-border px-4 sm:px-5">
          {TYPE_LEVELS.map((level) => (
            <TypeSpecimen
              key={level.utility}
              name={level.name}
              utility={level.utility}
              token={level.token}
              usage={level.usage}
              sample={level.sample}
            />
          ))}
        </div>
      </ShowcasePanel>
    </ShowcaseSection>
  );
}
