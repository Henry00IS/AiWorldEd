/** Brush ids that received a derived chamfer on the previous compile, per solid. */
export class ModifierBevelAffectedSet {
  private static readonly scopes = new Map<string, Set<string>>();

  /**
   * Returns the union of the previous chamfer set and a candidate set.
   *
   * @param scopeId Solid model identity.
   * @param next Candidate brush ids.
   * @returns Ids that should rebuild.
   */
  static union(scopeId: string, next: ReadonlySet<string>): string[] {
    const combined = new Set(ModifierBevelAffectedSet.scopes.get(scopeId) ?? []);
    for (const id of next) combined.add(id);
    return [...combined];
  }

  /**
   * Replaces the stored set and returns ids that entered or left.
   *
   * @param scopeId Solid model identity.
   * @param next New chamfered brush ids.
   * @returns Ids whose derived state changed.
   */
  static replace(scopeId: string, next: ReadonlySet<string>): string[] {
    const previous = ModifierBevelAffectedSet.scopes.get(scopeId) ?? new Set<string>();
    const changed = ModifierBevelAffectedSet.difference(previous, next);
    ModifierBevelAffectedSet.scopes.set(scopeId, new Set(next));
    return changed;
  }

  /**
   * Returns ids that are in only one of the two sets.
   *
   * @param previous Previous ids.
   * @param next Next ids.
   * @returns Symmetric difference.
   */
  private static difference(previous: ReadonlySet<string>, next: ReadonlySet<string>): string[] {
    const changed: string[] = [];
    for (const id of previous) {
      if (!next.has(id)) changed.push(id);
    }
    for (const id of next) {
      if (!previous.has(id)) changed.push(id);
    }
    return changed;
  }
}
