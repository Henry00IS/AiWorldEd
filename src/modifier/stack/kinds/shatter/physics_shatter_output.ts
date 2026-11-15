import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackDerivedMesh, modifierStackSourceIdOf } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import type { PhysicsShatterPiece } from './fracture/physics_shatter_types.js';
import type { PhysicsShatterInsideSettings } from './physics_shatter_settings.js';
import { physicsShatterCrackSurface } from './physics_shatter_crack_surface.js';
import { physicsShatterTransformMatrix, type PhysicsShatterPieceTransform } from './physics_shatter_transform.js';

/** What every output piece of one evaluation shares. */
export interface PhysicsShatterOutputJob {
  /** Evaluation context. */
  context: ModifierStackContext;
  /** Brush each input index came from, with its frame-to-model pose. */
  sources: readonly PhysicsShatterOutputSource[];
  /** Modifier frame to solid model matrix. */
  frameToModel: THREE.Matrix4;
  /** Crack face texture settings. */
  inside: PhysicsShatterInsideSettings;
}

/** One fracture input as the output builder needs it. */
export interface PhysicsShatterOutputSource {
  /** Brush the input came from. */
  brush: SolidBrushInstance;
  /** Brush-local to modifier frame matrix of the input. */
  localToFrame: THREE.Matrix4;
  /** Scene node the input's unit is placed after, or null. */
  origin: string | null;
}

/**
 * Builds the output brush of one piece at its baked pose. Original faces keep
 * the source face's texture and mapping, moved with the piece; crack faces get
 * the Inside Texture laid out before the piece moved.
 *
 * @param piece Fracture piece in the modifier frame.
 * @param transform Baked pose, or null for identity.
 * @param job Shared output state.
 * @returns Derived single-brush unit, or null when the source is unknown.
 */
export function physicsShatterOutputUnit(
  piece: PhysicsShatterPiece,
  transform: PhysicsShatterPieceTransform | null,
  job: PhysicsShatterOutputJob,
): ModifierStackUnit | null {
  const source = job.sources[piece.sourceIndex];
  if (!source) return null;
  const pose = transform ? physicsShatterTransformMatrix(transform, piece.centroid) : new THREE.Matrix4();
  const frameToOutput = job.frameToModel.clone().multiply(pose);
  const brush = piece.brush.clone();
  brush.transformVertices(frameToOutput);
  const id = `${source.brush.id}#${job.context.volume.uuid}:${job.context.step.id}:${piece.key}`;
  const instance = new SolidBrushInstance(id, source.brush.name, brush, source.brush.operation);
  const surfaces = physicsShatterOutputSurfaces(piece, source, frameToOutput, job.inside);
  instance.restoreFaceSurfaces(source.brush.serializeDefaultSurface(), surfaces);
  instance.mesh = modifierStackDerivedMesh(id, modifierStackSourceIdOf(source.brush));
  job.context.staging.add(instance.mesh);
  instance.mesh.updateMatrixWorld(true);
  return { tree: instance.mesh, brushes: [instance], authored: false, origin: source.origin };
}

/**
 * Builds the surface of every piece face in output coordinates.
 *
 * @param piece Fracture piece.
 * @param source Input the piece came from.
 * @param frameToOutput Frame to output coordinate matrix, pose included.
 * @param inside Crack face texture settings.
 * @returns Surface per face.
 */
function physicsShatterOutputSurfaces(
  piece: PhysicsShatterPiece,
  source: PhysicsShatterOutputSource,
  frameToOutput: THREE.Matrix4,
  inside: PhysicsShatterInsideSettings,
): FaceSurfaceDescription[] {
  const outputToFrame = frameToOutput.clone().invert();
  const outputToLocal = source.localToFrame.clone().invert().multiply(outputToFrame);
  const fallbackTextureId = source.brush.getFaceSurface(0).textureId;
  return piece.faces.map((origin, faceIndex) => {
    if (origin.kind === 'original') {
      const sourceFace = source.brush.brush.faces[origin.sourceFaceIndex];
      const surface = source.brush.getFaceSurface(sourceFace?.surfaceIndex ?? origin.sourceFaceIndex);
      return { ...surface, uv: surface.uv.multiplyMatrix4(outputToLocal) };
    }
    const normal = piece.brush.planes[faceIndex]?.normal ?? new THREE.Vector3(0, 1, 0);
    const surface = physicsShatterCrackSurface(normal, inside, fallbackTextureId);
    return { ...surface, uv: surface.uv.multiplyMatrix4(outputToFrame) };
  });
}
