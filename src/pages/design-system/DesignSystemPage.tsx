import { PageHeader, ThemeToggle } from '@/components';
import { Badge } from '@/design-system';
import { useDocumentTitle, useTheme } from '@/hooks';

import { ShowcaseContents, type ShowcaseContentsGroup } from './components/ShowcaseContents';
import {
  AppShellSection,
  AuthPatternsSection,
  ButtonSection,
  ColorSection,
  DashboardCardsSection,
  DataTableSection,
  DisplaySection,
  FormsSection,
  IconSection,
  LayoutSection,
  OverlaysSection,
  RadiusSection,
  ShadowSection,
  SpacingSection,
  TypographySection,
} from './sections';

/**
 * Design System showcase.
 *
 * The internal reference for the FLEETIN visual language. Foundation values are
 * read from the live stylesheet rather than restated in the page's own source,
 * and every component example renders the real component — so the page cannot
 * show something the code does not actually produce.
 *
 * Sections 01–06 are the foundations; 07 onwards document components. The
 * remaining Phase 2 steps (inputs, feedback, data display, tables, form
 * layouts) each add another section built from the same showcase primitives.
 */

const CONTENTS: ShowcaseContentsGroup[] = [
  {
    label: 'Foundations',
    entries: [
      { id: 'colors', label: '01 · Colours' },
      { id: 'typography', label: '02 · Typography' },
      { id: 'radius', label: '03 · Radius' },
      { id: 'shadows', label: '04 · Shadows' },
      { id: 'spacing', label: '05 · Spacing' },
      { id: 'icons', label: '06 · Icons' },
    ],
  },
  {
    label: 'Components',
    entries: [
      { id: 'buttons', label: '07 · Buttons' },
      { id: 'forms', label: '08 · Forms & Inputs' },
      { id: 'layout', label: '09 · Layout & Cards' },
      { id: 'display', label: '10 · Display Components' },
      { id: 'data-table', label: '11 · Tables' },
      { id: 'dashboard-cards', label: '12 · Dashboard & Console' },
      { id: 'app-shell', label: '13 · Application Shell' },
      { id: 'overlays', label: '14 · Overlays & Feedback' },
      { id: 'auth-patterns', label: '15 · Auth & Brand' },
    ],
  },
];

export function DesignSystemPage() {
  useDocumentTitle('Design System');

  const { resolvedTheme } = useTheme();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Design System"
        description="The visual language every FLEETIN screen is built from. Values shown here are read from the live stylesheet, so they always reflect the tokens actually in effect."
        badge={
          <Badge intent="primary" variant="subtle">
            Foundations + Dashboard System
          </Badge>
        }
        actions={<ThemeToggle />}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start">
        {/* Order is reversed on desktop so the contents rail sits on the right
            while remaining first in the DOM for keyboard and screen-reader users. */}
        <div className="min-w-0 space-y-14 lg:order-1">
          <ThemeNotice theme={resolvedTheme} />

          <ColorSection />
          <TypographySection />
          <RadiusSection />
          <ShadowSection />
          <SpacingSection />
          <IconSection />
          <ButtonSection />
          <FormsSection />
          <LayoutSection />
          <DisplaySection />
          <DataTableSection />
          <DashboardCardsSection />
          <AppShellSection />
          <OverlaysSection />
          <AuthPatternsSection />
        </div>



        <ShowcaseContents
          groups={CONTENTS}
          className="hidden lg:order-2 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
        />
      </div>
    </div>
  );
}

/**
 * Reminds the reader that the values below are theme-dependent — without this
 * the hexes look like absolute facts about the palette rather than the current
 * theme's resolution of each role.
 */
function ThemeNotice({ theme }: { theme: string }) {
  return (
    <p className="rounded-md border border-border bg-surface-sunken px-4 py-3 type-body-sm text-muted-foreground">
      Showing resolved values for the{' '}
      <span className="font-medium text-foreground">{theme}</span> theme. Colours, shadows and
      elevation resolve differently per theme — switch themes above to compare.
    </p>
  );
}

export default DesignSystemPage;
