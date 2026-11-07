import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackPoseTouches } from './modifier_stack_capture.js';

/**
 * Turns the generator node units a volume touches into operands of that volume.
 * A piece is captured on its own, like an authored brush, so the volume can
 * copy, reshape, bevel, or hide it; copies go right after it.
 *
 * @param pieces Units the solid's generator nodes built, in solid space.
 * @param volume Modifier volume.
 * @param solidRoot Solid root.
 * @returns Captured units.
 */
export function modifierStackGeneratorPiecesTouched(
  pieces: readonly ModifierStackUnit[],
  volume: THREE.Object3D,
  solidRoot: THREE.Object3D,
): ModifierStackUnit[] {
  const toWorld = solidRoot.matrixWorld;
  return pieces
    .filter((unit) => unit.brushes.some((brush) => brush.visible && modifierStackPoseTouches(brush, volume, toWorld)))
    .map((unit) => ({ tree: unit.tree, brushes: unit.brushes, authored: true, origin: unit.tree.uuid }));
}

/**
 * Applies what volumes did to generator pieces: reshaped, bevelled, or hidden
 * stand-ins replace the pieces. Cached units are never changed; new unit
 * objects carry the swapped brushes.
 *
 * @param pieces Units the solid's generator nodes built.
 * @param swap Returns a piece's replacement, or the piece itself.
 * @returns Units for the compile tree.
 */
export function modifierStackGeneratorPiecesSwap(
  pieces: readonly ModifierStackUnit[],
  swap: (brush: SolidBrushInstance) => SolidBrushInstance,
): ModifierStackUnit[] {
  return pieces.map((unit) => {
    const brushes = unit.brushes.map(swap);
    return brushes.every((brush, index) => brush === unit.brushes[index]) ? unit : { ...unit, brushes };
  });
}
