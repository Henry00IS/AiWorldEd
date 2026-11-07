import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';

/**
 * Describes where derived brushes sit among CSG groups: each brush id with the
 * operations of the groups above it.
 *
 * @param derived Derived brushes placed in the compile tree.
 * @returns Group path per brush id.
 */
export function modifierStackDerivedStructure(derived: readonly SolidBrushInstance[]): Map<string, string> {
  const paths = new Map<string, string>();
  for (const brush of derived) {
    const groups: string[] = [];
    for (let node = brush.mesh?.parent ?? null; node; node = node.parent)
      if (isSolidCsgGroup(node)) groups.push(String(getSolidGroupOperation(node)));
    paths.set(brush.id, groups.join('/'));
  }
  return paths;
}

/**
 * Tells whether a brush kept between compiles moved into or out of a CSG group,
 * such as generator pieces switching to Intersect. An incremental compile of
 * the changed brushes is not enough then; added or vanished brushes are.
 *
 * @param previous Group paths of the previous compile.
 * @param next Group paths of this compile.
 * @returns True when a kept brush changed groups.
 */
export function modifierStackRegrouped(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>) {
  for (const [id, path] of next) if (previous.has(id) && previous.get(id) !== path) return true;
  return false;
}
