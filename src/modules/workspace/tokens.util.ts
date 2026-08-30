/**
 * The one token shape a Workspace message body uses.
 *
 *   @[user:9f3c…-…|Ahmed Farah]
 *   @[shipment:SHI-00412]
 *   @[vehicle:VEH-00212|DJ-4471-AB]
 *
 * Bodies are stored with tokens INTACT and rendered by the client. Storing
 * rendered HTML instead would make every future change to how a chip looks a
 * data migration, and would hand the database a second escaping problem it
 * does not need.
 *
 * The trailing `|label` is a convenience for a reader looking at raw text — it
 * is never trusted. A name can change; the id is what resolves.
 *
 * This file is the server half. `src/features/workspace/composer/tokens.ts` in
 * the frontend parses the same grammar; the round-trip test lives there.
 */

const TOKEN = /@\[([a-z_]+):([^\]|]+)(?:\|[^\]]*)?\]/gi;

export interface ParsedToken {
  /** `user`, or a record kind such as `shipment` / `vehicle`. */
  kind: string;
  /** A user id, or a record reference. */
  value: string;
}

export function parseTokens(body: string): ParsedToken[] {
  const out: ParsedToken[] = [];
  for (const match of body.matchAll(TOKEN)) {
    const kind = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (kind && value) out.push({ kind, value });
  }
  return out;
}

/** Just the user ids named in a body, de-duplicated. */
export function mentionedUserIds(body: string): string[] {
  return [
    ...new Set(
      parseTokens(body)
        .filter((t) => t.kind === 'user')
        .map((t) => t.value),
    ),
  ];
}
