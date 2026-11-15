import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { MODIFIER_STACK_CAP_TEXTURE_FIELDS } from '@/modifier/stack/kinds/generator/modifier_stack_generator_cap_textures.js';
import { MODIFIER_STACK_GENERATOR_SMOOTH_FIELD } from '@/modifier/stack/kinds/generator/modifier_stack_generator_smooth.js';
import { ModifierStackKindGeneratorCapped } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator_capped.js';
import type { ModifierStackPieceSurfaces } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import {
  modifierStackSweepPieces,
  modifierStackSweepSmoothClasses,
  modifierStackSweepSurfaces,
  type ModifierStackSweepCell,
  type ModifierStackSweepLook,
} from './modifier_stack_primitive_sweep.js';

/**
 * Base class of primitives built by turning a convex cross-section around the
 * vertical axis of their box, one convex brush per segment. Textures run
 * seamlessly along the sweep and turn with the volume.
 */
export abstract class ModifierStackKindPrimitiveSwept extends ModifierStackKindGeneratorCapped {
  protected override readonly surfacesFollowVolume = true;
  protected override readonly shadingFields = [
    ...MODIFIER_STACK_CAP_TEXTURE_FIELDS,
    MODIFIER_STACK_GENERATOR_SMOOTH_FIELD,
  ];
  /** True smooths level side faces too, as on a round tube. */
  protected readonly smoothAll: boolean = false;

  /**
   * Returns the cells of the shape in sweep order.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Cells.
   */
  protected abstract cells(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackSweepCell[];

  /**
   * Builds one convex brush per cell.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex brushes in sweep order.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    return modifierStackSweepPieces(this.cells(parameters, box));
  }

  /**
   * Runs the texture along the sweep and gives the end faces a planar mapping.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Face surfaces.
   */
  protected override pieceSurfaces(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): ModifierStackPieceSurfaces {
    return modifierStackSweepSurfaces(piece, this.cells(parameters, box), this.look(box));
  }

  /**
   * Smooths the swept side faces and keeps the end faces flat.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Class per face.
   */
  protected override pieceSmoothClasses(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): readonly number[] {
    return modifierStackSweepSmoothClasses(piece, this.cells(parameters, box), this.look(box));
  }

  /**
   * Returns the texture anchor and shading options of a box.
   *
   * @param box Volume box in frame coordinates.
   * @returns Look.
   */
  private look(box: THREE.Box3): ModifierStackSweepLook {
    return { anchor: box.min.clone(), smoothAll: this.smoothAll };
  }
}
