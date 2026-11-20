/**
 * Buyer results, one card per project.
 *
 * Matching still ranks apartment types one by one (each type has its own
 * price, size and score range). This folds those rows into projects:
 *   - the project's card is led by its best-scoring type that fits the buyer,
 *   - other fitting types of the same project are listed under it,
 *   - types that fail the buyer's requirements are hidden from that card
 *     (the project page shows them as dimmed tabs),
 *   - projects with no fitting type at all stay in the "near match" list.
 */

export interface RankedType {
  aomId: string;
  projectId?: string;
  valid: boolean;
  passesHardFilters?: boolean;
}

export interface ProjectGroup<T extends RankedType> {
  key: string;
  best: T;
  others: T[];
  hidden: T[];
}

/** Results saved before project fields existed group by type, as before. */
const keyOf = (r: RankedType) => r.projectId ?? `type:${r.aomId}`;

/**
 * @param full  types that fit (valid and pass hard filters), best first
 * @param near  types that are feasible but fail a hard filter, best first
 */
export function groupByProject<T extends RankedType>(full: T[], near: T[]): { groups: ProjectGroup<T>[]; near: T[] } {
  const groups: ProjectGroup<T>[] = [];
  const byKey = new Map<string, ProjectGroup<T>>();
  for (const r of full) {
    const k = keyOf(r);
    const g = byKey.get(k);
    if (g) g.others.push(r);
    else {
      const created = { key: k, best: r, others: [], hidden: [] };
      byKey.set(k, created);
      groups.push(created);
    }
  }
  const restNear: T[] = [];
  for (const r of near) {
    const g = byKey.get(keyOf(r));
    if (g) g.hidden.push(r);
    else restNear.push(r);
  }
  return { groups, near: restNear };
}
