import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { ModifierStackKindGenerator } from './modifier_stack_kind_generator.js';
import {
  modifierStackCapTexturesOmitDefaults,
  modifierStackCapTexturesPick,
} from './modifier_stack_generator_cap_textures.js';

/** Generator with optional textures on horizontal top and bottom faces. */
export abstract class ModifierStackKindGeneratorCapped extends ModifierStackKindGenerator {
  /**
   * Normalizes parameters, leaving the optional top and bottom textures out
   * while they are unused.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    return modifierStackCapTexturesOmitDefaults(super.normalizeParameters(input));
  }

  /**
   * Gives flat top and bottom faces their own textures when switched on.
   *
   * @param piece Piece in frame coordinates.
   * @param parameters Normalized parameters.
   * @returns Texture per face, or null when off.
   */
  protected override pieceFaceTextures(
    piece: SolidBrush,
    parameters: Record<string, unknown>,
  ): readonly (string | undefined)[] | null {
    return modifierStackCapTexturesPick(piece, parameters);
  }
}
