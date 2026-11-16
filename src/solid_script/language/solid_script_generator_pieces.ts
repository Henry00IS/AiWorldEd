import * as THREE from 'three';
// The catalog comes first: it loads every kind in an order that works, which
// importing one kind on its own would not.
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';

/** Where a generator's box sits in script coordinates. */
export interface SolidScriptGeneratorBox {
  /** Width (X), height (Y) and depth (Z) in metres. */
  size: readonly [number, number, number];
  /** Lowest corner in metres. */
  min: readonly [number, number, number];
}

/**
 * Builds a generator's pieces in a box of the script, the way the generator
 * fills its own box. Scripts and generators share the editor's axes.
 *
 * @param kindId Box generator kind id.
 * @param parameters Generator parameters under its own field names.
 * @param box Box in script coordinates.
 * @returns Corner points of each convex piece, in script coordinates.
 */
export function solidScriptGeneratorPieces(
  kindId: string,
  parameters: Record<string, unknown>,
  box: SolidScriptGeneratorBox,
): THREE.Vector3[][] {
  const kind = modifierStackKindFind(kindId);
  if (!(kind instanceof ModifierStackKindGenerator)) throw new Error(`there is no ${kindId} generator`);
  const min = new THREE.Vector3(...box.min);
  const frame = new THREE.Box3(min, min.clone().add(new THREE.Vector3(...box.size)));
  return kind.previewPieces(parameters, frame).map((piece) => piece.vertices.map((point) => point.clone()));
}
