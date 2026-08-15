import { COMPANY } from '@/config/company';
import { useSystemSettings } from '@/features/settings';
import { Panel } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';

import { ColorField, FieldGrid, ImageField, SectionNote, SelectField, ToggleField } from '../components/fields';

/**
 * Logos and appearance defaults.
 *
 * Note what is deliberately absent: there is no control for the interface's
 * primary colour. Fleetin teal is fixed, and the sidebar reads white on it —
 * that pairing has been settled and re-settled, and a colour picker here would
 * be an invitation to break it. What an operator genuinely needs to swap is
 * artwork, so that is what this section holds. The one colour offered is the
 * document accent, which only ever reaches printed paper.
 */
export function BrandingSection() {
  const branding = useSystemSettings().branding;
  const update = useSettingsStore((s) => s.update);
  const set = (patch: Partial<typeof branding>) => update('branding', patch);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Logos" subtitle="Replaces the artwork shipped in /public — no redeploy needed">
        <FieldGrid>
          <ImageField
            label="Wordmark"
            value={branding.logoSrc}
            fallbackSrc={COMPANY.logoSrc}
            onChange={(v) => set({ logoSrc: v })}
            hint="Login screen, expanded sidebar, document letterhead."
          />
          <ImageField
            label="Wordmark — dark panels"
            value={branding.logoWhiteSrc}
            fallbackSrc={branding.logoSrc ?? COMPANY.logoSrc}
            onChange={(v) => set({ logoWhiteSrc: v })}
            dark
            hint="Optional. A white or light version for the teal sidebar; falls back to the colour wordmark."
          />
          <ImageField
            label="Icon mark"
            value={branding.markSrc}
            fallbackSrc={COMPANY.markSrc}
            onChange={(v) => set({ markSrc: v })}
            hint="Square glyph. Collapsed sidebar rail and the document footer."
          />
          <ImageField
            label="Favicon"
            value={branding.faviconSrc}
            fallbackSrc={branding.markSrc ?? COMPANY.markSrc}
            onChange={(v) => set({ faviconSrc: v })}
            hint="Browser tab icon. Falls back to the icon mark."
          />
          <ImageField
            label="Login artwork"
            value={branding.loginBackgroundSrc}
            onChange={(v) => set({ loginBackgroundSrc: v })}
            hint="Optional image behind the sign-in form."
          />
          <SectionNote>
            Images are stored in this browser, so each is capped at 512 KB. Export a PNG around 600 px wide with a
            transparent background — that prints cleanly at letterhead size and stays well under the limit.
          </SectionNote>
        </FieldGrid>
      </Panel>

      <Panel title="Appearance" subtitle="Defaults for a user who has never chosen">
        <FieldGrid>
          <SelectField
            label="Default theme"
            value={branding.defaultTheme}
            onChange={(v) => set({ defaultTheme: v })}
            options={[
              { value: 'system', label: 'Follow the operating system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            hint="A user who picks their own theme keeps it; this only sets the starting point."
          />
          <ColorField
            label="Document accent"
            value={branding.documentAccent}
            onChange={(v) => set({ documentAccent: v })}
            hint="Rules and table heads on printed invoices and vouchers. Does not affect the interface."
          />
          <ToggleField
            label="Start with the sidebar collapsed"
            description="Opens the app on the narrow icon rail. Useful on laptops where screen width is tight."
            checked={branding.sidebarCollapsedByDefault}
            onChange={(v) => set({ sidebarCollapsedByDefault: v })}
          />
        </FieldGrid>
      </Panel>
    </div>
  );
}
