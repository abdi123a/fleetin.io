/**
 * Who a delay belongs to, and why it happened.
 *
 * The specification is explicit that these are **two separate fields**, each
 * from a closed list, because a free-text reason cannot be summed. The monthly
 * report's responsibility analysis (§12) is a `GROUP BY` over the party; the
 * reason is what makes the group actionable.
 *
 * Attribution is *derived* here rather than stored: the system has no
 * delay-attribution table yet (the backend's BI service says so plainly), so
 * every report states which side of the return deadline the evidence falls on
 * and marks itself `derived`. When a stored attribution arrives, it takes
 * precedence and the same two fields carry it — nothing downstream changes.
 */

/** §7 — the responsible-party categories, verbatim. */
export const RESPONSIBLE_PARTIES = [
  'client_shipper',
  'transporter',
  'driver',
  'fleetin',
  'port_terminal',
  'shipping_line',
  'external',
  'under_review',
] as const;

export type ResponsibleParty = (typeof RESPONSIBLE_PARTIES)[number];

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  client_shipper: 'Client / Shipper',
  transporter: 'Transporter',
  driver: 'Driver',
  fleetin: 'Fleetin',
  port_terminal: 'Port / Terminal',
  shipping_line: 'Shipping Line',
  external: 'External',
  under_review: 'Under Review',
};

/** §8 — the standardized delay reasons, verbatim. */
export const DELAY_REASONS = [
  'late_depotage',
  'container_not_ready',
  'truck_unavailable',
  'driver_delay',
  'documentation_issue',
  'empty_return_booking_issue',
  'port_terminal_congestion',
  'shipping_line_issue',
  'operational_issue',
  'force_majeure',
  'other',
] as const;

export type DelayReason = (typeof DELAY_REASONS)[number];

export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  late_depotage: 'Late dépotage',
  container_not_ready: 'Container not ready',
  truck_unavailable: 'Truck unavailable',
  driver_delay: 'Driver delay',
  documentation_issue: 'Documentation issue',
  empty_return_booking_issue: 'Empty return booking issue',
  port_terminal_congestion: 'Port / terminal congestion',
  shipping_line_issue: 'Shipping line issue',
  operational_issue: 'Operational issue',
  force_majeure: 'Force majeure / external issue',
  other: 'Other',
};

export interface DelayAttribution {
  party: ResponsibleParty;
  reason: DelayReason;
  /** The optional operational comment §8 allows — context, never a substitute for the two fields. */
  comment?: string;
  /**
   * `recorded` once operations attribute a delay by hand; `derived` while the
   * report reads it off the timestamps. Printed on the report so a shipper
   * knows whether they are looking at a judgement or an inference.
   */
  source: 'recorded' | 'derived';
}

export interface DerivedAttributionInput {
  /** End of free time, set by the shipping line. */
  deadlineAt: number | null;
  /** When the empty was reported ready — the end of the client's dépotage. */
  emptyReadyAt: number | null;
  /** When the empty was actually handed back at the depot. */
  returnedAt: number | null;
  /** Whether the box has crossed the deadline at all. */
  isLate: boolean;
  /** Flagged when the empty came back without ever carrying a load out. */
  standaloneReturnNote?: string | null;
}

/**
 * Read the responsible party off the deadline.
 *
 * The deadline splits the container cycle in two, and the evidence is
 * unambiguous on each side:
 *
 * - the empty was still not ready when free time ran out → the box sat at the
 *   client's yard, so the delay is dépotage;
 * - it was ready inside free time but crossed the deadline on the road → the
 *   return leg is the transporter's;
 * - it has not been reported ready at all and the deadline has passed →
 *   dépotage is still running.
 *
 * Anything the timestamps cannot separate returns `under_review` rather than a
 * guess: the specification lists that category precisely so nobody is blamed
 * by a default value.
 */
export function deriveAttribution(input: DerivedAttributionInput): DelayAttribution | null {
  if (input.standaloneReturnNote) {
    return {
      party: 'client_shipper',
      reason: 'empty_return_booking_issue',
      comment: input.standaloneReturnNote,
      source: 'derived',
    };
  }
  if (!input.isLate || input.deadlineAt === null) return null;

  const { deadlineAt, emptyReadyAt, returnedAt } = input;

  if (emptyReadyAt !== null && emptyReadyAt > deadlineAt) {
    return {
      party: 'client_shipper',
      reason: 'late_depotage',
      comment:
        'The empty was not reported ready until after the return deadline — the container was held past its free time at the destination.',
      source: 'derived',
    };
  }
  if (emptyReadyAt !== null && returnedAt !== null) {
    return {
      party: 'transporter',
      reason: 'operational_issue',
      comment:
        'The empty was ready inside free time; the return trip to the depot crossed the deadline.',
      source: 'derived',
    };
  }
  if (emptyReadyAt === null) {
    return {
      party: 'client_shipper',
      reason: 'late_depotage',
      comment: 'The container has not been reported empty and the return deadline has passed.',
      source: 'derived',
    };
  }
  return { party: 'under_review', reason: 'other', source: 'derived' };
}
