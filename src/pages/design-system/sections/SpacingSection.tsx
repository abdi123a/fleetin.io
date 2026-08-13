import { ShowcasePanel, ShowcaseSection, SpacingSpecimen } from '@/design-system/showcase';

import { SPACING_MAX_PX, SPACING_TOKENS } from '../catalog/foundations.catalog';

/**
 * Section 5 — Spacing.
 *
 * Bars are sized proportionally to the largest step so the ramp reads as a
 * single scale rather than twelve unrelated values.
 */
export function SpacingSection() {
  return (
    <ShowcaseSection
      id="spacing"
      index="05"
      title="Spacing"
      description="A 4px grid with half-steps down to 2px, because the console panels genuinely need them — gap-1.5 and p-2.5 are two of the most-written spacing classes in the product. Reach for a listed step rather than an arbitrary value: p-[13px] is the one thing that reliably makes screens look inconsistent. The same scale drives padding, gap and margin utilities."
    >
      <ShowcasePanel>
        <div className="divide-y divide-border-subtle">
          {SPACING_TOKENS.map((spacing) => (
            <SpacingSpecimen
              key={spacing.token}
              name={spacing.name}
              token={spacing.token}
              step={spacing.step}
              scale={(spacing.px / SPACING_MAX_PX) * 100}
              usage={spacing.usage}
            />
          ))}
        </div>
      </ShowcasePanel>
    </ShowcaseSection>
  );
}
