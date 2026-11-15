import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { ModifierStackKindGeneratorCapped } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator_capped.js';
import type { ModifierStackPieceSurfaces } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import { MODIFIER_STACK_CAP_TEXTURE_FIELDS } from '@/modifier/stack/kinds/generator/modifier_stack_generator_cap_textures.js';
import { modifierStackPrimitivePlanarSurfaces } from './modifier_stack_primitive_planar.js';

/**
 * Base class of primitives with only flat faces, such as pyramids and prisms.
 * Every face gets a planar mapping anchored at the box corner, so coplanar
 * faces of neighbouring pieces continue one texture, and textures turn with the
 * volume.
 */
export abstract class ModifierStackKindPrimitiveFlat extends ModifierStackKindGeneratorCapped {
  protected override readonly surfacesFollowVolume = true;
  protected override readonly shadingFields = MODIFIER_STACK_CAP_TEXTURE_FIELDS;

  /**
   * Maps every face planar from the box corner.
   *
   * @param piece Piece in frame coordinates.
   * @param _parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Face surfaces.
   */
  protected override pieceSurfaces(
    piece: SolidBrush,
    _parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): ModifierStackPieceSurfaces {
    return modifierStackPrimitivePlanarSurfaces(piece, box.min);
  }
}
