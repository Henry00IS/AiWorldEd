import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackSettings, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackCaptureEligible, modifierStackUnder } from './modifier_stack_capture.js';
import { modifierStackIsDerived } from './modifier_stack_copy.js';

/** Parameter keys that name a cap piece by object id. */
export const MODIFIER_STACK_CAP_KEYS = ['startCap', 'endCap'] as const;

/**
 * Lists the object ids a stack names as caps.
 *
 * @param settings Normalized stack.
 * @returns Distinct non-empty ids.
 */
export function modifierStackCapIds(settings: ModifierStackSettings): string[] {
  const ids = settings.modifiers.flatMap((step) => MODIFIER_STACK_CAP_KEYS.map((key) => step.parameters[key]));
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

/**
 * Resolves cap ids to units of the authored brushes under each named group or
 * brush of one solid. Ids that name nothing usable in this solid, the solid
 * itself, or a derived piece are left out, so a deleted cap simply vanishes.
 *
 * @param settings Normalized stack.
 * @param sources Authored brushes of the solid.
 * @param solidRoot Solid model root.
 * @param volume Modifier volume.
 * @returns Cap unit per id.
 */
export function modifierStackCapsResolve(
  settings: ModifierStackSettings,
  sources: readonly SolidBrushInstance[],
  solidRoot: THREE.Object3D,
  volume: THREE.Object3D,
): Map<string, ModifierStackUnit> {
  const caps = new Map<string, ModifierStackUnit>();
  for (const id of modifierStackCapIds(settings)) {
    const node = solidRoot.getObjectByProperty('uuid', id);
    if (!node || node === solidRoot || modifierStackIsDerived(node)) continue;
    const brushes = sources.filter(
      (source) => modifierStackCaptureEligible(source, volume) && modifierStackUnder(source.mesh, node),
    );
    if (brushes.length > 0) caps.set(id, { tree: node, brushes, authored: true, origin: node.uuid });
  }
  return caps;
}
