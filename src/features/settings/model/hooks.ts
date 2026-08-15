import { useMemo } from 'react';

import { COMPANY } from '@/config/company';
import { getSettings, useSettingsStore } from '@/stores/settings.store';

import { useSettings as useServerSettings } from '../api/queries';
import type { SystemSettings } from './types';

/**
 * The settings a screen should read.
 *
 * One subtlety and it is the whole reason this hook exists rather than a bare
 * store selector: `commission.fleetinCommissionPct` is **server-owned**. It
 * decides what every transporter is paid, so a per-browser copy of it would be
 * a per-browser answer to a company-wide question. The local store keeps a
 * mirror for offline reads; whenever `/settings` has answered, the server's
 * figure wins. Everything else is local until the API grows to hold it.
 */
export function useSystemSettings(): SystemSettings {
  const local = useSettingsStore((s) => s.settings);
  const { data: server } = useServerSettings();

  return useMemo(() => {
    if (!server) return local;
    if (server.fleetinCommissionPct === local.commission.fleetinCommissionPct) return local;
    return {
      ...local,
      commission: { ...local.commission, fleetinCommissionPct: server.fleetinCommissionPct },
    };
  }, [local, server]);
}

/** The legal entity, for anything that prints. */
export function useOrganization() {
  return useSystemSettings().organization;
}

/** Logos, marks and appearance defaults, already resolved to a usable src. */
export function useBranding() {
  const branding = useSystemSettings().branding;
  return useMemo(
    () => ({
      ...branding,
      /** Never null — falls back to the file shipped in `/public`. */
      resolvedLogoSrc: branding.logoSrc ?? COMPANY.logoSrc,
      resolvedMarkSrc: branding.markSrc ?? COMPANY.markSrc,
      /** A white wordmark is optional; the colour one reads on most panels. */
      resolvedLogoWhiteSrc: branding.logoWhiteSrc ?? branding.logoSrc ?? COMPANY.logoSrc,
      resolvedFaviconSrc: branding.faviconSrc ?? branding.markSrc ?? COMPANY.markSrc,
    }),
    [branding],
  );
}

/**
 * The letterhead, assembled once.
 *
 * `InvoiceDocumentPage` and `PaymentVoucherPage` both print the same block;
 * this is that block, so the two documents cannot drift apart.
 */
export function useLetterhead() {
  const org = useOrganization();
  const branding = useBranding();
  const documents = useSystemSettings().documents;

  return useMemo(
    () => ({
      legalName: org.legalName,
      tradingName: org.tradingName,
      tagline: org.tagline,
      addressLines: [org.addressLine1, org.addressLine2, org.city, org.country].filter(Boolean),
      contactLines: [org.phone, org.email, org.website].filter(Boolean),
      registrationLines: [org.tradeRegister, org.taxId].filter(Boolean),
      logoSrc: branding.resolvedLogoSrc,
      markSrc: branding.resolvedMarkSrc,
      logoHeightMm: documents.logoHeightMm,
      showFooterMark: documents.showFooterMark,
      accent: branding.documentAccent,
    }),
    [org, branding, documents],
  );
}

/** Finance policy — terms, peg, payout rules. */
export function useFinancePolicy() {
  return useSystemSettings().finance;
}

/** Operational thresholds — grace windows, targets, risk weights. */
export function useOperationsPolicy() {
  return useSystemSettings().operations;
}

// ─── Non-React readers ──────────────────────────────────────────────────────
//
// Formatters and mappers run outside the render tree. They read the store
// directly; a value changed in Settings is picked up on the next call, which
// is what a formatter wants — it has no subscription to re-render from.

/** DJF per USD. The franc is pegged; this is a configured rate, not a market one. */
export function usdToDjfRate(): number {
  return getSettings().finance.usdToDjf;
}

/** Converts a USD figure to DJF at the configured peg. */
export function toDjf(usd: number): number {
  return usd * usdToDjfRate();
}

/** Days between invoice issue and due date. */
export function paymentTermsDays(): number {
  return getSettings().finance.paymentTermsDays;
}

/** Free time when the shipping line has not stated one. */
export function defaultFreeTimeDays(): number {
  return getSettings().finance.defaultFreeTimeDays;
}

/** Detention per container per day, and the currency it is quoted in. */
export function detentionRate(): { amount: number; currency: string } {
  const { detentionRatePerDay, detentionCurrency } = getSettings().finance;
  return { amount: detentionRatePerDay, currency: detentionCurrency };
}
