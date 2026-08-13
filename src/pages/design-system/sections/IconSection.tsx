import { ICON_RULES, ICON_SIZES, Icons } from '@/design-system/icons';
import {
  GuidelineList,
  IconTile,
  ShowcaseGrid,
  ShowcaseSection,
  ShowcaseSubsection,
} from '@/design-system/showcase';

import { ICON_CATEGORIES, ICON_COUNT } from '../catalog/icons.catalog';

/**
 * Section 06 — Icons System.
 *
 * Centralized Lucide React icon registry and usage guidelines.
 */
export function IconSection() {
  return (
    <ShowcaseSection
      id="icons"
      index="06"
      title="Icons & Registry"
      description={`Every icon comes from Lucide, through the registry at @/design-system/icons. The ${ICON_COUNT} below are the ones the product actually renders — the gallery is pruned against real call sites, so an icon on this page is an icon in use. Lucide ships several glyphs under two names; where the registry re-exports both, the tile shows the pair.`}
    >
      {/* System Guidelines & Code Usage */}
      <ShowcaseSubsection
        title="Icon System Usage & Guidelines"
        description="Centralized imports, color inheritance, size tokens, and accessibility standards."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-5">
            <h4 className="mb-3 text-sm font-semibold text-foreground">Importing Icons</h4>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
              {`// Recommended registry import:
import { Icons } from "@/design-system/icons";

<Icons.Truck className="size-5 text-primary" />
<Icons.Users className="size-4 text-muted-foreground" />
<Icons.File className="size-6 text-foreground" />

// Direct named re-export:
import { Truck, Users } from "@/design-system/icons";`}
            </pre>
          </div>

          <div className="rounded-md border border-border bg-card p-5">
            <h4 className="mb-3 text-sm font-semibold text-foreground">Core Rules & Accessibility</h4>
            <GuidelineList
              guidelines={[
                {
                  do: `Coloring: ${ICON_RULES.colorInheritance}`,
                  dont: 'Do not hardcode HEX or RGB colors on icons.',
                },
                {
                  do: `Semantic Tokens: ${ICON_RULES.semanticTokens}`,
                  dont: 'Do not import directly from "lucide-react" outside the registry.',
                },
                {
                  do: `Accessibility: ${ICON_RULES.accessibility.decorative}`,
                  dont: 'Do not create custom SVG icons unless representing unique FLEETIN branding.',
                },
                {
                  do: `Interactive: ${ICON_RULES.accessibility.interactive}`,
                  dont: 'Do not omit aria-hidden on decorative icons paired with text.',
                },
              ]}
            />

          </div>
        </div>
      </ShowcaseSubsection>

      {/* Recommended Sizes */}
      <ShowcaseSubsection
        title="Standard Sizes"
        description="Consistently apply pixel height/width tokens using standard size utility classes."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ICON_SIZES.map((item) => (
            <div
              key={item.size}
              className="flex flex-col items-center rounded-md border border-border bg-card p-4 text-center"
            >
              <div className="mb-3 flex size-12 items-center justify-center rounded-md bg-muted/50">
                <Icons.Truck className={`${item.tailwindClass} text-primary`} />
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">
                {item.pixels} ({item.tailwindClass})
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground">{item.useCase}</span>
            </div>
          ))}
        </div>
      </ShowcaseSubsection>

      {/* Categorized Icons Grid */}
      {ICON_CATEGORIES.map((category) => (
        <ShowcaseSubsection
          key={category.id}
          title={category.title}
          description={category.description}
          aside={`${category.icons.length} icons`}
        >
          <ShowcaseGrid minColumnWidth="7.5rem">
            {category.icons.map((entry) => (
              <IconTile
                key={entry.name}
                icon={entry.icon}
                name={entry.name}
                alias={entry.alias}
                note={entry.note}
              />
            ))}
          </ShowcaseGrid>
        </ShowcaseSubsection>
      ))}
    </ShowcaseSection>
  );
}
