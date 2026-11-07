import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame, modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackDerivedMesh } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { MODIFIER_STACK_SHAPE_EPSILON } from './modifier_stack_generator_shapes.js';

/**
 * Face surfaces of one piece in frame coordinates; undefined keeps a face's
 * default.
 */
export type ModifierStackPieceSurfaces = readonly (FaceSurfaceDescription | undefined)[];

/** Output fields shared by every generator kind. */
const MODIFIER_STACK_GENERATOR_OUTPUT_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'texture',
    label: 'Texture',
    type: 'choice',
    default: 'captured',
    group: 'Output',
    choices: modifierStackChoices([
      ['captured', 'From captured brush'],
      ['default', 'Default checker'],
    ]),
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
   * Returns kind-specific and shared fields.
   *
   * @returns Field list.
   */
  get fields(): readonly ModifierStackField[] {
    return [...this.specificFields, ...MODIFIER_STACK_GENERATOR_OUTPUT_FIELDS];
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
    const pieces = this.grantedPieces(this.buildPieces(parameters, box), context);
    const textureId = parameters['texture'] === 'captured' ? this.capturedTexture(units) : '';
    const made = pieces.map((piece, index) => {
      const surfaces = this.pieceSurfaces(piece, parameters, box);
      return this.pieceUnit(piece, index, context, { textureId, surfaces });
    });
    return [...kept, ...made];
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
   * Returns the texture of the first captured face, if any.
   *
   * @param units Previous output.
   * @returns Texture id, or empty for the default surface.
   */
  private capturedTexture(units: readonly ModifierStackUnit[]): string {
    const first = units[0]?.brushes[0];
    return first ? first.getSurfaceTextureId(0) : '';
  }

  /**
   * Turns one frame-space piece into a derived brush unit.
   *
   * @param piece Convex piece in frame coordinates.
   * @param index Piece index, used in the derived id.
   * @param context Evaluation context.
   * @param look Texture for every face (or empty) and custom frame-space
   *   surfaces.
   * @returns Derived single-brush unit.
   */
  private pieceUnit(
    piece: SolidBrush,
    index: number,
    context: ModifierStackContext,
    look: { textureId: string; surfaces: ModifierStackPieceSurfaces | null },
  ): ModifierStackUnit {
    const id = `${context.volume.uuid}#${context.step.id}:${index}`;
    const frame = modifierStackFrame(context.volume, 'volume');
    const toLocal = context.solidRoot.matrixWorld.clone().invert().multiply(frame);
    piece.transformVertices(toLocal);
    const brush = new SolidBrushInstance(id, `${context.step.name} ${index + 1}`, piece);
    this.pieceSurfacesApply(brush, look.surfaces, toLocal);
    if (look.textureId) brush.setAllFacesTextureId(look.textureId);
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
