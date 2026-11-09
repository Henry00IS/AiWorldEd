import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import {
  ModifierStackKind,
  type ModifierStackCategory,
  type ModifierStackPoseFollow,
} from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame, modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackDerivedMesh } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import {
  MODIFIER_STACK_GENERATOR_TEXTURE_FIELDS,
  modifierStackGeneratorTextureApply,
} from './modifier_stack_generator_texture.js';
import { modifierStackCapTexturesApply } from './modifier_stack_generator_cap_textures.js';
import { MODIFIER_STACK_SHAPE_EPSILON } from './modifier_stack_generator_shapes.js';
import { modifierStackGeneratorSmoothTag } from './modifier_stack_generator_smooth.js';
import { modifierSmoothTagSet, type ModifierSmoothTag } from '@/modifier/smooth/modifier_smooth_shading.js';

/**
 * Face surfaces of one piece in frame coordinates; undefined keeps a face's
 * default.
 */
export type ModifierStackPieceSurfaces = readonly (FaceSurfaceDescription | undefined)[];

/** CSG operation of each stored Operation choice. */
export const MODIFIER_STACK_GENERATOR_OPERATIONS: Readonly<Record<string, SolidOperation>> = {
  add: SolidOperation.Additive,
  subtract: SolidOperation.Subtractive,
  intersect: SolidOperation.Intersecting,
};

/** Output fields shared by every generator kind. */
const MODIFIER_STACK_GENERATOR_OUTPUT_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'operation',
    label: 'Operation',
    type: 'choice',
    default: 'add',
    choices: modifierStackChoices([
      ['add', 'Add'],
      ['subtract', 'Subtract'],
      ['intersect', 'Intersect'],
    ]),
    hint: 'Set with the solid Additive / Subtractive / Intersect buttons and the A key, like brushes.',
    hidden: true,
  },
  {
    key: 'keepInput',
    label: 'Keep input',
    type: 'boolean',
    default: false,
    group: 'Output',
    hint: 'Also pass the incoming brushes to the modifiers below. Captured brushes always stay in the level.',
  },
];

/**
 * Base class of modifiers that build new convex brushes inside the volume box.
 * Pieces are built in the volume frame, so volume scale sizes the result
 * without distorting it.
 */
export abstract class ModifierStackKindGenerator extends ModifierStackKind {
  readonly category: ModifierStackCategory = 'generate';
  /** Kind-specific fields shown before the shared ones. */
  protected abstract readonly specificFields: readonly ModifierStackField[];
  /** Shading fields shown after the texture, such as smooth shading. */
  protected readonly shadingFields: readonly ModifierStackField[] = [];
  /**
   * True when every face gets frame-space surfaces from pieceSurfaces, so
   * textures turn with the volume; false leaves faces world aligned.
   */
  protected readonly surfacesFollowVolume: boolean = false;

  /**
   * Builds the pieces for a box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Convex pieces in frame coordinates.
   */
  protected abstract buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[];

  /**
   * Returns custom face surfaces of a piece, such as wrapped side textures. The
   * default keeps every face on its default mapping.
   *
   * @param _piece Piece in frame coordinates.
   * @param _parameters Normalized parameters.
   * @param _box Volume box in frame coordinates.
   * @returns Surfaces in frame coordinates, or null for defaults.
   */
  protected pieceSurfaces(
    _piece: SolidBrush,
    _parameters: Record<string, unknown>,
    _box: THREE.Box3,
  ): ModifierStackPieceSurfaces | null {
    return null;
  }

  /**
   * Returns textures that replace the main one on some faces of a piece, such
   * as separate top and bottom textures. The default changes no face.
   *
   * @param _piece Piece in frame coordinates.
   * @param _parameters Normalized parameters.
   * @returns Texture per face, undefined keeping the main texture; or null.
   */
  protected pieceFaceTextures(
    _piece: SolidBrush,
    _parameters: Record<string, unknown>,
  ): readonly (string | undefined)[] | null {
    return null;
  }

  /**
   * Returns the smoothing class of each face of a piece. The default puts every
   * face in one class, so only the max angle decides.
   *
   * @param _piece Piece in frame coordinates.
   * @param _parameters Normalized parameters.
   * @param _box Volume box in frame coordinates.
   * @returns Class per face, or undefined.
   */
  protected pieceSmoothClasses(
    _piece: SolidBrush,
    _parameters: Record<string, unknown>,
    _box: THREE.Box3,
  ): readonly number[] | undefined {
    return undefined;
  }

  /**
   * Returns the CSG operation of the pieces, from the stored Operation that the
   * solid operation buttons set.
   *
   * @param parameters Normalized parameters.
   * @returns Operation.
   */
  protected pieceOperation(parameters: Record<string, unknown>): SolidOperation {
    return MODIFIER_STACK_GENERATOR_OPERATIONS[String(parameters['operation'])] ?? SolidOperation.Additive;
  }

  /**
   * Returns kind-specific and shared fields.
   *
   * @returns Field list.
   */
  get fields(): readonly ModifierStackField[] {
    return [
      ...this.specificFields,
      ...MODIFIER_STACK_GENERATOR_TEXTURE_FIELDS,
      ...this.shadingFields,
      ...MODIFIER_STACK_GENERATOR_OUTPUT_FIELDS,
    ];
  }

  /**
   * Returns whether captured brushes keep flowing down the stack.
   *
   * @param parameters Normalized parameters.
   * @returns True when Keep input is on.
   */
  override passesAuthoredInput(parameters: Record<string, unknown>): boolean {
    return parameters['keepInput'] === true;
  }

  /**
   * Returns how the pieces follow a moved or turned volume. Pieces are built in
   * the volume frame, so their shape always follows; textures follow a turn
   * only when every face carries frame-space surfaces.
   *
   * @param _parameters Normalized parameters.
   * @returns 'rigid' with frame-space surfaces, else 'translate'.
   */
  override volumePoseFollow(_parameters: Record<string, unknown>): ModifierStackPoseFollow {
    return this.surfacesFollowVolume ? 'rigid' : 'translate';
  }

  /**
   * Adds the generated pieces to the working set.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Generated units, after the input when Keep input is on.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const parameters = context.step.parameters;
    const kept = this.passesAuthoredInput(parameters) ? [...units] : [];
    if (!context.ownsGenerated) return kept;
    const box = modifierStackVolumeBox(context.volume);
    const size = box.getSize(new THREE.Vector3());
    if (box.isEmpty() || Math.min(size.x, size.y, size.z) < MODIFIER_STACK_SHAPE_EPSILON) {
      context.report.error = 'The volume is too thin to build in.';
      return kept;
    }
    const operation = this.pieceOperation(parameters);
    const made = this.pieceUnits(this.grantedPieces(this.buildPieces(parameters, box), context), box, context);
    if (operation !== SolidOperation.Intersecting || made.length === 0) return [...kept, ...made];
    return [...kept, modifierStackGeneratorIntersectUnit(made, context)];
  }

  /**
   * Turns the pieces into derived units with their surfaces and smoothing.
   * Intersecting pieces are additive; the group around them intersects.
   *
   * @param pieces Pieces in frame coordinates.
   * @param box Volume box in frame coordinates.
   * @param context Evaluation context.
   * @returns One unit per piece.
   */
  private pieceUnits(pieces: SolidBrush[], box: THREE.Box3, context: ModifierStackContext): ModifierStackUnit[] {
    const parameters = context.step.parameters;
    const operation = this.pieceOperation(parameters);
    const pieceOperation = operation === SolidOperation.Intersecting ? SolidOperation.Additive : operation;
    return pieces.map((piece, index) => {
      const surfaces = this.pieceSurfaces(piece, parameters, box);
      const classes = this.pieceSmoothClasses(piece, parameters, box);
      const smooth = modifierStackGeneratorSmoothTag(parameters, context, classes);
      const textures = this.pieceFaceTextures(piece, parameters);
      return this.pieceUnit(piece, index, context, {
        parameters,
        surfaces,
        textures,
        operation: pieceOperation,
        smooth,
      });
    });
  }

  /**
   * Keeps as many pieces as the brush budget allows.
   *
   * @param pieces Built pieces.
   * @param context Evaluation context.
   * @returns Granted pieces.
   */
  private grantedPieces(pieces: SolidBrush[], context: ModifierStackContext): SolidBrush[] {
    const granted = context.budget.takeCopies(1, pieces.length);
    if (granted < pieces.length)
      context.report.error = `Brush budget reached: ${granted} of ${pieces.length} pieces made.`;
    return pieces.slice(0, granted);
  }

  /**
   * Turns one frame-space piece into a derived brush unit.
   *
   * @param piece Convex piece in frame coordinates.
   * @param index Piece index, used in the derived id.
   * @param context Evaluation context.
   * @param look Parameters holding the texture slot, custom frame-space
   *   surfaces, per-face replacement textures, the CSG operation and the
   *   smoothing.
   * @returns Derived single-brush unit.
   */
  private pieceUnit(
    piece: SolidBrush,
    index: number,
    context: ModifierStackContext,
    look: {
      parameters: Record<string, unknown>;
      surfaces: ModifierStackPieceSurfaces | null;
      textures: readonly (string | undefined)[] | null;
      operation: SolidOperation;
      smooth: ModifierSmoothTag | undefined;
    },
  ): ModifierStackUnit {
    const id = `${context.volume.uuid}#${context.step.id}:${index}`;
    const frame = modifierStackFrame(context.volume, 'volume');
    const toLocal = context.solidRoot.matrixWorld.clone().invert().multiply(frame);
    piece.transformVertices(toLocal);
    const brush = new SolidBrushInstance(id, `${context.step.name} ${index + 1}`, piece, look.operation);
    this.pieceSurfacesApply(brush, look.surfaces, toLocal);
    modifierStackGeneratorTextureApply(brush, look.parameters);
    modifierStackCapTexturesApply(brush, look.textures);
    if (look.smooth) modifierSmoothTagSet(brush, look.smooth);
    brush.mesh = modifierStackDerivedMesh(id, null);
    context.staging.add(brush.mesh);
    brush.mesh.updateMatrixWorld(true);
    return { tree: brush.mesh, brushes: [brush], authored: false, origin: null };
  }

  /**
   * Stores custom surfaces on a piece, moving their UV matrices from frame to
   * brush-local coordinates.
   *
   * @param brush Piece brush in local coordinates.
   * @param surfaces Frame-space surfaces, or null.
   * @param toLocal Transform from frame to local coordinates.
   */
  private pieceSurfacesApply(
    brush: SolidBrushInstance,
    surfaces: ModifierStackPieceSurfaces | null,
    toLocal: THREE.Matrix4,
  ): void {
    if (!surfaces) return;
    const toFrame = toLocal.clone().invert();
    surfaces.forEach((surface, index) => {
      if (surface) brush.setFaceSurface(index, { ...surface, uv: surface.uv.multiplyMatrix4(toFrame) });
    });
  }
}

/**
 * Joins the pieces in one intersecting CSG group, so Intersect keeps the
 * overlap with the whole shape instead of with each piece in turn.
 *
 * @param made Additive piece units.
 * @param context Evaluation context.
 * @returns One group unit holding every piece.
 */
function modifierStackGeneratorIntersectUnit(
  made: readonly ModifierStackUnit[],
  context: ModifierStackContext,
): ModifierStackUnit {
  const group = new THREE.Group();
  group.name = context.step.name;
  markAsSolidCsgGroup(group, SolidOperation.Intersecting);
  context.staging.add(group);
  for (const unit of made) group.add(unit.tree);
  group.updateMatrixWorld(true);
  return { tree: group, brushes: made.flatMap((unit) => unit.brushes), authored: false, origin: null };
}
