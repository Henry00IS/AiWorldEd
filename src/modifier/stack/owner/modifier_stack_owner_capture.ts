import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackCapture } from '@/modifier/stack/evaluate/modifier_stack_authored_bevel.js';
import { modifierStackCapsResolve } from '@/modifier/stack/evaluate/modifier_stack_caps.js';
import { modifierStackCaptureEligible, modifierStackUnder } from '@/modifier/stack/evaluate/modifier_stack_capture.js';
import { isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';

/**
 * Captures what a brush or CSG group's own stack acts on: one authored unit of
 * every valid brush under it, minus the caps its stack names. Nothing outside
 * the owner is ever captured.
 *
 * @param owner Brush or CSG group carrying a stack.
 * @param authored Authored brushes of its solid.
 * @param solidRoot Solid model root.
 * @returns Capture, ready for evaluation like a volume's.
 */
export function modifierStackOwnerCaptureOf(
  owner: THREE.Object3D,
  authored: readonly SolidBrushInstance[],
  solidRoot: THREE.Object3D,
): ModifierStackCapture {
  const settings = ModifierVolume.read(owner);
  const caps = modifierStackCapsResolve(settings, authored, solidRoot, owner);
  const capNodes = [...caps.values()].map((cap) => cap.tree);
  const brushes = authored.filter(
    (source): source is SolidBrushInstance & { mesh: THREE.Mesh } =>
      modifierStackCaptureEligible(source, owner) &&
      modifierStackUnder(source.mesh, owner) &&
      !capNodes.some((node) => modifierStackUnder(source.mesh, node)),
  );
  const units: ModifierStackUnit[] =
    brushes.length > 0 ? [{ tree: owner, brushes, authored: true, origin: owner.uuid }] : [];
  return {
    caps,
    volume: owner,
    settings,
    units,
    skipped: modifierStackOwnerInvalidCount(authored, owner),
    unbevelled: 0,
  };
}

/**
 * Counts invalid brushes under an owner that its stack skips.
 *
 * @param authored Authored brushes of the solid.
 * @param owner Brush or CSG group.
 * @returns Skipped brush count.
 */
function modifierStackOwnerInvalidCount(authored: readonly SolidBrushInstance[], owner: THREE.Object3D): number {
  return authored.filter(
    (source) => source.mesh && isSolidBrushMarkedNonConvex(source.mesh) && modifierStackUnder(source.mesh, owner),
  ).length;
}
