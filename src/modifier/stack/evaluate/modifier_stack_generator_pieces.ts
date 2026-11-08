import type * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackTargets } from '@/modifier/stack/scope/modifier_stack_targets.js';
import { modifierVolumeBlacklistIgnores } from '@/modifier/volume/modifier_volume_blacklist.js';

/**
 * Turns the generator node units a volume affects into operands of that volume:
 * units of generators before it in its parent whose built geometry meets the
 * box, unless the volume excludes the generator. A piece is captured on its
 * own, like an authored brush, so the volume can copy, reshape, bevel, or hide
 * it; copies go right after it.
 *
 * @param targets What the volume affects in this solid.
 * @param volume Modifier volume.
 * @returns Captured units.
 */
export function modifierStackGeneratorPiecesTouched(
  targets: ModifierStackTargets,
  volume: THREE.Object3D,
): ModifierStackUnit[] {
  return targets.pieces
    .filter((unit) => !modifierVolumeBlacklistIgnores(volume, targets.pieceGenerators.get(unit) ?? null))
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
