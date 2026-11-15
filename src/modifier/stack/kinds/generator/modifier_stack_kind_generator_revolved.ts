import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { generatorRevolveProfileBrushes } from '@/generator/revolve/generator_revolve_blend.js';
import {
  generatorRevolveSectionFrame,
  type GeneratorRevolveFrame,
} from '@/generator/revolve/generator_revolve_brush.js';
import {
  generatorRevolveBlendSmoothClasses,
  generatorRevolveBlendSurfaces,
} from '@/generator/revolve/generator_revolve_blend_surface.js';
import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import { generatorRevolveSmoothClasses } from '@/generator/revolve/generator_revolve_shading.js';
import {
  generatorRevolveStationAt,
  generatorRevolveSurfaces,
  generatorRevolveUvLayout,
} from '@/generator/revolve/generator_revolve_surface.js';
import { ModifierStackKindGeneratorCapped } from './modifier_stack_kind_generator_capped.js';
import type { ModifierStackPieceSurfaces } from './modifier_stack_kind_generator.js';
import { modifierStackRevolveWrap } from './modifier_stack_generator_revolve_wrap.js';

/**
 * Base class of generators that revolve a profile of stations around the
 * vertical axis of their box: convex rings, a texture wrapped seamlessly around
 * and along the profile, flat caps and smooth sides.
 */
export abstract class ModifierStackKindGeneratorRevolved extends ModifierStackKindGeneratorCapped {
  protected override readonly surfacesFollowVolume = true;

  /**
   * Returns the profile stations in metres, bottom to top.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Stations.
   */
  protected abstract stations(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveStation[];

  /**
   * Returns the axis base, side count and cross-section aspect.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Revolve frame.
   */
  protected abstract revolveFrame(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveFrame;

  /**
   * Revolves the profile into convex brushes.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex brushes from bottom to top.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    return generatorRevolveProfileBrushes(this.revolveFrame(parameters, box), this.stations(parameters, box));
  }

  /**
   * Wraps the texture around the sides and along the whole profile.
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
    const round = this.revolveFrame(parameters, box);
    const stations = this.stations(parameters, box);
    const wrap = modifierStackRevolveWrap(parameters, stations, round.sides, round.aspect ?? 1);
    const layout = generatorRevolveUvLayout(stations, round.sides, wrap, round.aspect);
    const station = this.pieceStation(piece, round, stations);
    if (modifierStackRevolvedBlends(station)) return generatorRevolveBlendSurfaces(piece, round, layout);
    return generatorRevolveSurfaces(piece, generatorRevolveSectionFrame(round, station ?? false), layout);
  }

  /**
   * Keeps caps and flat sections flat; curved facets smooth together.
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
    const round = this.revolveFrame(parameters, box);
    const station = this.pieceStation(piece, round, this.stations(parameters, box));
    if (modifierStackRevolvedBlends(station)) return generatorRevolveBlendSmoothClasses(piece, round);
    return generatorRevolveSmoothClasses(piece, generatorRevolveSectionFrame(round, station ?? false));
  }

  /**
   * Finds the station a piece starts at, from its lowest vertex.
   *
   * @param piece Piece in frame coordinates.
   * @param round Revolve frame.
   * @param stations Profile stations.
   * @returns Station, or undefined.
   */
  private pieceStation(
    piece: SolidBrush,
    round: GeneratorRevolveFrame,
    stations: readonly GeneratorRevolveStation[],
  ): GeneratorRevolveStation | undefined {
    const bottom = Math.min(...piece.vertices.map((vertex) => vertex.y)) - round.center.y;
    return generatorRevolveStationAt(stations, bottom);
  }
}

/**
 * Returns whether the piece starting at a station morphs between two sections.
 *
 * @param station Station at the bottom of the piece.
 * @returns True for a blended piece.
 */
function modifierStackRevolvedBlends(station: GeneratorRevolveStation | undefined): boolean {
  return !!(station?.blendStart || station?.blendEnd);
}
