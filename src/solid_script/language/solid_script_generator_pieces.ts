import * as THREE from 'three';
// The catalog comes first: it loads every kind in an order that works, which
// importing one kind on its own would not.
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackKindGenerator } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { createDefaultFaceSurface, orientDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import type { SolidScriptFaceUv } from './solid_script_shape.js';

/** Where a generator's box sits in script coordinates. */
export interface SolidScriptGeneratorBox {
  /** Width (X), height (Y) and depth (Z) in metres. */
  size: readonly [number, number, number];
  /** Lowest corner in metres. */
  min: readonly [number, number, number];
}

/** One convex piece of a generator, as a script builds it. */
export interface SolidScriptGeneratorPiece {
  /** Corner points in script coordinates. */
  points: THREE.Vector3[];
  /**
   * Texture mapping of every face in script coordinates, as the generator maps
   * it.
   */
  faceUvs: SolidScriptFaceUv[];
}

/**
 * Builds a generator's pieces in a box of the script, the way the generator
 * fills its own box, with the generator's texture mapping on every face: its
 * own surfaces where it has them, such as a texture wrapped around a blast
 * hole, and else the default mapping in the box's space, so the texture runs on
 * unbroken from piece to piece like on the generator. Scripts and generators
 * share the editor's axes.
 *
 * @param kindId Box generator kind id.
 * @param parameters Generator parameters under its own field names.
 * @param box Box in script coordinates.
 * @returns Each convex piece, in script coordinates.
 */
export function solidScriptGeneratorPieces(
  kindId: string,
  parameters: Record<string, unknown>,
  box: SolidScriptGeneratorBox,
): SolidScriptGeneratorPiece[] {
  const kind = modifierStackKindFind(kindId);
  if (!(kind instanceof ModifierStackKindGenerator)) throw new Error(`there is no ${kindId} generator`);
  const min = new THREE.Vector3(...box.min);
  const frame = new THREE.Box3(min, min.clone().add(new THREE.Vector3(...box.size)));
  return kind.surfacedPieces(parameters, frame).map(({ piece, surfaces }) => ({
    points: piece.vertices.map((point) => point.clone()),
    faceUvs: piece.faces.map((face, index) => {
      const corners = piece.getFaceVertices(face);
      const point = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(corners.length);
      const normal = piece.planes[index]!.normal.clone().normalize();
      const uv =
        surfaces?.[index]?.uv ??
        orientDefaultFaceSurface(createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID), normal).uv;
      return { point, normal, uv: uv.clone() };
    }),
  }));
}
