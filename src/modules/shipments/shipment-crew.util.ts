/**
 * Who is on point.
 *
 * Pulled out of `ShipmentsService.setAssignees` because it is the one part of
 * crew editing that makes a *decision* rather than writing what it was told,
 * and it has three branches that are easy to get subtly wrong:
 *
 * - an explicit `leadUserId` always wins (validated separately — it must be on
 *   the crew, which is a rejection, not a silent correction);
 * - otherwise the existing lead keeps point, so adding a colleague to a job
 *   does not quietly hand it to them;
 * - otherwise the first person named leads, so a crew is never left with
 *   nobody to call.
 *
 * An empty crew has no lead, which is the honest answer rather than a
 * shipment nobody is on that still names someone.
 */
export function resolveCrewLead(
  wantedUserIds: string[],
  currentLeadUserId: string | undefined,
  requestedLeadUserId: string | undefined,
): string | undefined {
  if (requestedLeadUserId) return requestedLeadUserId;
  if (currentLeadUserId && wantedUserIds.includes(currentLeadUserId)) return currentLeadUserId;
  return wantedUserIds[0];
}
