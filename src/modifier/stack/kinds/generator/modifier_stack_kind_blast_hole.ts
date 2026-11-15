import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindGenerator, type ModifierStackPieceSurfaces } from './modifier_stack_kind_generator.js';
import { modifierStackConvexFromLoops } from './modifier_stack_generator_shapes.js';
import { BLAST_HOLE_FIELDS, blastHoleFillBackShown } from './blast_hole/modifier_stack_blast_hole_fields.js';
import { BLAST_HOLE_WALL_TEXTURE_FIELD } from './blast_hole/modifier_stack_blast_hole_wall_texture.js';
import { blastHoleShape, type BlastHoleOutlineSettings } from './blast_hole/modifier_stack_blast_hole_outline.js';
import { blastHoleBricks } from './blast_hole/modifier_stack_blast_hole_bricks.js';
import { BLAST_HOLE_MIN_THICKNESS } from './blast_hole/modifier_stack_blast_hole_quality.js';
import { blastHoleRaggedShape } from './blast_hole/modifier_stack_blast_hole_ragged.js';
import type { BlastHoleRaggedSettings } from './blast_hole/modifier_stack_blast_hole_ragged_depth.js';
import {
  BLAST_HOLE_FORMAT_VERSION,
  BLAST_HOLE_FORMAT_VERSION_KEY,
  blastHoleFormatMigrate,
} from './blast_hole/modifier_stack_blast_hole_format.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import { BlastHoleUvWrap, blastHoleUvSurfaces } from './blast_hole/modifier_stack_blast_hole_uv.js';

/**
 * Reads a number parameter.
 *
 * @param parameters Normalized parameters.
 * @param key Key.
 * @param fallback Value when missing.
 * @returns Number.
 */
function blastHoleNumber(parameters: Record<string, unknown>, key: string, fallback: number): number {
  const value = parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads the outline settings.
 *
 * @param parameters Normalized parameters.
 * @returns Outline settings.
 */
export function blastHoleOutlineSettingsRead(parameters: Record<string, unknown>): BlastHoleOutlineSettings {
  return {
    seed: Math.round(blastHoleNumber(parameters, 'seed', 1)),
    spikes: blastHoleNumber(parameters, 'spikes', 9),
    spikeLength: blastHoleNumber(parameters, 'spikeLength', 0.45),
    roughness: blastHoleNumber(parameters, 'roughness', 0.5),
    detail: blastHoleNumber(parameters, 'detail', 1),
  };
}

/**
 * Reads the Jagged style settings.
 *
 * @param parameters Normalized parameters.
 * @returns Jagged settings.
 */
export function blastHoleRaggedSettingsRead(parameters: Record<string, unknown>): BlastHoleRaggedSettings {
  return {
    seed: Math.round(blastHoleNumber(parameters, 'seed', 1)),
    shape: blastHoleNumber(parameters, 'shape', 0.8),
    jagSize: blastHoleNumber(parameters, 'jagSize', 0.3),
    roughness: blastHoleNumber(parameters, 'roughness', 0.5),
    bites: blastHoleNumber(parameters, 'bites', 3),
    detail: blastHoleNumber(parameters, 'detail', 1),
  };
}

/**
 * Extrudes one convex outline part through the box depth.
 *
 * @param part Convex part around the box centre.
 * @param box Box in the frame.
 * @returns Prism brush, or null when degenerate.
 */
function blastHolePrism(part: readonly THREE.Vector2[], box: THREE.Box3): SolidBrush | null {
  const center = box.getCenter(new THREE.Vector3());
  const ring = (z: number): THREE.Vector3[] => part.map((p) => new THREE.Vector3(center.x + p.x, center.y + p.y, z));
  const front = ring(box.max.z);
  const back = ring(box.min.z);
  const sides = part.map((_, index) => {
    const next = (index + 1) % part.length;
    return [back[index]!, back[next]!, front[next]!, front[index]!];
  });
  return modifierStackConvexFromLoops([front, back, ...sides]);
}

/**
 * Builds a box brush from its corners.
 *
 * @param min Lower corner.
 * @param max Upper corner.
 * @returns Box brush, or null when degenerate.
 */
function blastHoleBox(min: THREE.Vector3, max: THREE.Vector3): SolidBrush | null {
  const corner = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z);
  const c = (index: number): THREE.Vector3 => corner(index & 1, (index >> 1) & 1, (index >> 2) & 1);
  const faces = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  return modifierStackConvexFromLoops(faces.map((loop) => loop.map(c)));
}

/**
 * Blast Hole generator: a seeded blast outline extruded through the box depth
 * along its Z axis, split into convex prisms that tile it exactly, or the whole
 * bricks of a brick grid that fall inside a star-shaped outline. Jagged is a
 * ragged outline filling the box. Set Subtractive to punch it into a wall; Fill
 * Back then adds the same pieces back for a Physics Shatter step to blow out.
 */
export class ModifierStackKindBlastHole extends ModifierStackKindGenerator {
  readonly id = 'blastHole';
  readonly label = 'Blast Hole';
  readonly description =
    'Builds a ragged, seeded blast hole that fills the box, extruded through it and split into convex pieces.';
  protected readonly specificFields: readonly ModifierStackField[] = BLAST_HOLE_FIELDS;
  protected override readonly shadingFields: readonly ModifierStackField[] = [BLAST_HOLE_WALL_TEXTURE_FIELD];
  protected override readonly surfacesFollowVolume = true;
  /**
   * Outline wrap of the pieces the last buildPieces call made, which
   * pieceSurfaces reads right after.
   */
  private wrap: BlastHoleUvWrap | null = null;

  /**
   * Builds the hole pieces in the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex pieces in frame coordinates.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const size = box.getSize(new THREE.Vector3());
    this.wrap = null;
    if (size.z < BLAST_HOLE_MIN_THICKNESS) return [];
    if (parameters['style'] === 'bricks') return this.buildBricks(parameters, box, size);
    const shape = blastHoleRaggedShape(blastHoleRaggedSettingsRead(parameters), size.x / 2, size.y / 2);
    if (!shape) return [];
    this.wrap = new BlastHoleUvWrap(shape.outline);
    return shape.parts.map((part) => blastHolePrism(part, box)).filter((brush): brush is SolidBrush => !!brush);
  }

  /**
   * Wraps the texture around the cut faces of the hole at one tile per metre,
   * with V across the wall, so it runs on unbroken from face to face.
   *
   * @param piece Piece in frame coordinates.
   * @param _parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Frame-space surfaces of every face.
   */
  protected override pieceSurfaces(
    piece: SolidBrush,
    _parameters: Record<string, unknown>,
    box: THREE.Box3,
  ): ModifierStackPieceSurfaces {
    return blastHoleUvSurfaces(piece, box, this.wrap);
  }

  /**
   * Builds the Bricks style: whole bricks of a brick grid inside the star
   * outline.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @param size Box size.
   * @returns Brick boxes.
   */
  private buildBricks(parameters: Record<string, unknown>, box: THREE.Box3, size: THREE.Vector3): SolidBrush[] {
    const shape = blastHoleShape(blastHoleOutlineSettingsRead(parameters), size.x / 2, size.y / 2);
    if (!shape) return [];
    const center = box.getCenter(new THREE.Vector3());
    const outline = shape.outline.map((point) => point.clone().add(new THREE.Vector2(center.x, center.y)));
    const bricks = blastHoleBricks(outline, box, {
      seed: Math.round(blastHoleNumber(parameters, 'seed', 1)),
      brickLength: blastHoleNumber(parameters, 'brickLength', 0.4),
      brickHeight: blastHoleNumber(parameters, 'brickHeight', 0.2),
      bond: String(parameters['bond'] ?? 'running'),
      jut: blastHoleNumber(parameters, 'jut', 0.35),
    });
    return bricks.map((brick) => blastHoleBox(brick.min, brick.max)).filter((brush): brush is SolidBrush => !!brush);
  }

  /**
   * Normalizes the fields after upgrading older formats: a version 1 Jagged
   * hole becomes the new Jagged with its star-only rows dropped. A newer format
   * keeps its version.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    return modifierStackFieldsNormalize(this.fields, blastHoleFormatMigrate(input));
  }

  /**
   * Starts new Blast Holes at the current format, so they get the new Jagged.
   *
   * @returns Partial parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { [BLAST_HOLE_FORMAT_VERSION_KEY]: BLAST_HOLE_FORMAT_VERSION };
  }

  /**
   * Fills back in Subtract mode when Fill Back is on.
   *
   * @param parameters Normalized parameters.
   * @returns True to add the pieces back after cutting them.
   */
  protected override fillsBack(parameters: Record<string, unknown>): boolean {
    return blastHoleFillBackShown(parameters) && parameters['fillBack'] === true;
  }
}
