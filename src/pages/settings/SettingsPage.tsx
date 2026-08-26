import { useMemo, useRef, useState, type ComponentType } from 'react';

import { Button } from '@/design-system';
import {
  Bell,
  Building2,
  Download,
  FileText,
  Gauge,
  Key,
  Languages,
  ListOrdered,
  Palette,
  Percent,
  RotateCcw,
  Upload,
  Wallet,
  Zap,
  type LucideIcon,
} from '@/design-system/icons';
import type { SettingsSection } from '@/features/settings';
import { PageHead } from '@/pages/finance/components/kit';
import { useSettingsStore } from '@/stores/settings.store';
import { cn } from '@/utils';

import { AccessSection } from './sections/AccessSection';
import { BrandingSection } from './sections/BrandingSection';
import { CommissionSection } from './sections/CommissionSection';
import { DocumentsSection } from './sections/DocumentsSection';
import { FinanceSection } from './sections/FinanceSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { LocalizationSection } from './sections/LocalizationSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { NumberingSection } from './sections/NumberingSection';
import { OperationsSection } from './sections/OperationsSection';
import { OrganizationSection } from './sections/OrganizationSection';

/**
 * Settings.
 *
 * Ordered by how far a wrong value travels, not alphabetically and not by how
 * often anyone visits. The first three sections print on paper a client or an
 * employee holds; the next two decide what money moves; the rest tune what the
 * app does with itself. Somebody scanning the rail for "where do I fix the
 * thing on the invoice" should not have to know which module owns it.
 *
 * Every field writes as you type — there is no page-level Save, because a
 * settings page with one is a settings page you can lose work on. The single
 * exception is the commission, which is server-owned and takes a deliberate
 * click; it says so where it lives.
 */

interface SectionSpec {
  id: SettingsSection;
  label: string;
  blurb: string;
  icon: LucideIcon;
  Component: ComponentType;
  group: string;
}

/** Non-empty by construction, so `SECTIONS[0]` is a real fallback. */
const SECTIONS: readonly [SectionSpec, ...SectionSpec[]] = [
  {
    id: 'organization',
    label: 'Organisation',
    blurb: 'Legal entity, address and identifiers',
    icon: Building2,
    Component: OrganizationSection,
    group: 'Company',
  },
  {
    id: 'branding',
    label: 'Branding',
    blurb: 'Logos, favicon and appearance defaults',
    icon: Palette,
    Component: BrandingSection,
    group: 'Company',
  },
  {
    id: 'documents',
    label: 'Documents',
    blurb: 'Letterhead, signatories, stamp and wording',
    icon: FileText,
    Component: DocumentsSection,
    group: 'Company',
  },
  {
    id: 'commission',
    label: 'Commission & billing',
    blurb: 'Commission rate, billing cycle and rounding',
    icon: Percent,
    Component: CommissionSection,
    group: 'Money',
  },
  {
    id: 'finance',
    label: 'Finance policy',
    blurb: 'Currency, terms, release rules and detention',
    icon: Wallet,
    Component: FinanceSection,
    group: 'Money',
  },
  {
    id: 'operations',
    label: 'Operations',
    blurb: 'Thresholds, targets and corridor costs',
    icon: Gauge,
    Component: OperationsSection,
    group: 'Operations',
  },
  {
    id: 'numbering',
    label: 'Numbering',
    blurb: 'Reference prefixes and formats',
    icon: ListOrdered,
    Component: NumberingSection,
    group: 'Operations',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    blurb: 'AI, email, SMS, tracking, storage and webhooks',
    icon: Zap,
    Component: IntegrationsSection,
    group: 'Platform',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    blurb: 'Events, recipients and channels',
    icon: Bell,
    Component: NotificationsSection,
    group: 'Platform',
  },
  {
    id: 'access',
    label: 'Access & security',
    blurb: 'Sessions, passwords, joining rules and audit retention',
    icon: Key,
    Component: AccessSection,
    group: 'Platform',
  },
  {
    id: 'localization',
    label: 'Localisation',
    blurb: 'Language, time zone, formats and calendar',
    icon: Languages,
    Component: LocalizationSection,
    group: 'Platform',
  },
];

export function SettingsPage() {
  const [active, setActive] = useState<SettingsSection>('organization');
  const settings = useSettingsStore((s) => s.settings);
  const reset = useSettingsStore((s) => s.reset);
  const importAll = useSettingsStore((s) => s.importAll);
  const importRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => SECTIONS.find((section) => section.id === active) ?? SECTIONS[0],
    [active],
  );
  const groups = useMemo(() => Array.from(new Set(SECTIONS.map((s) => s.group))), []);

  /**
   * Settings live in this browser, so the export is the only backup there is —
   * and the only way to put the same configuration on a second machine.
   */
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fleetin-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
        importAll(parsed);
      } catch {
        window.alert('That file is not a Fleetin settings export.');
      }
    };
    reader.readAsText(file);
  };

  const Section = current.Component;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pb-8 pt-1 sm:px-6">
      <PageHead
        title="Settings"
        actions={
          <>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                handleImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => importRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* The rail. Horizontal chips on a phone, a column from lg up — the
            same trick the finance module uses for its channel tabs. */}
        <nav className="lg:sticky lg:top-4 lg:w-[248px] lg:shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-4 lg:overflow-visible lg:pb-0">
            {groups.map((group) => (
              <div key={group} className="flex gap-2 lg:flex-col lg:gap-1">
                <p className="hidden px-3 pb-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground lg:block">
                  {group}
                </p>
                {SECTIONS.filter((section) => section.group === group).map((section) => {
                  const Icon = section.icon;
                  const isActive = section.id === active;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActive(section.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-left text-sm font-bold transition-colors lg:rounded-card lg:px-3 lg:py-2.5',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap lg:whitespace-normal">{section.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Reset "${current.label}" to defaults? Other sections are untouched.`,
                )
              ) {
                reset(current.id);
              }
            }}
            className="mt-4 hidden w-full items-center gap-2 rounded-card px-3 py-2.5 text-left text-xs font-bold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-destructive-subtle-foreground lg:flex"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            Reset {current.label.toLowerCase()}
          </button>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="mb-4">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">{current.label}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{current.blurb}</p>
          </div>

          <Section />

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Changes save as you type. Settings are stored in this browser, so{' '}
            <strong className="font-bold text-foreground">Export</strong> is the only backup.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
