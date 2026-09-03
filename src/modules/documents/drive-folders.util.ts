/**
 * A folder and everything beneath it, as ids — the folder's own first.
 *
 * Deleting a folder means deleting the files in every folder under it, and
 * those files carry no foreign key to walk (documents never do), so the ids
 * are collected here off one read of the whole table rather than by a query
 * per level. The table is small: it is one row per folder somebody chose to
 * make, not one per record.
 */
export function descendantsOf(rootId: string, folders: readonly { id: string; parentId: string | null }[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const siblings = childrenOf.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    childrenOf.set(folder.parentId, siblings);
  }

  const ids: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift() as string;
    /* A cycle cannot be written through the API, but a walk that would spin
       forever on one is not worth the saving of a set. */
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

/** Whether `candidateParentId` is `folderId` itself or anywhere beneath it. */
export function isWithin(
  folderId: string,
  candidateParentId: string,
  folders: readonly { id: string; parentId: string | null }[],
): boolean {
  return descendantsOf(folderId, folders).includes(candidateParentId);
}
