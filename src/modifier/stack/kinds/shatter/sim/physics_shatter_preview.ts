import * as THREE from 'three';
import { modifierStackCacheOf } from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import {
  physicsShatterTransformMatrix,
  type PhysicsShatterPieceTransform,
} from '@/modifier/stack/kinds/shatter/physics_shatter_transform.js';

/** Colour of the pieces while a simulation plays. */
const PHYSICS_SHATTER_PREVIEW_COLOR = 0xb9b2a6;

/** Modifiers whose pieces a running simulation draws instead of the stack. */
const physicsShatterPreviewsActive = new Set<string>();

/**
 * Returns the registry key of one modifier.
 *
 * @param volumeUuid Owning volume uuid.
 * @param stepId Modifier id.
 * @returns Key.
 */
function physicsShatterPreviewKey(volumeUuid: string, stepId: string): string {
  return `${volumeUuid}/${stepId}`;
}

/**
 * Returns whether a simulation of this modifier is playing, so its stack output
 * steps aside for the moving pieces.
 *
 * @param volumeUuid Owning volume uuid.
 * @param stepId Modifier id.
 * @returns True while a simulation plays.
 */
export function physicsShatterPreviewActive(volumeUuid: string, stepId: string): boolean {
  return physicsShatterPreviewsActive.has(physicsShatterPreviewKey(volumeUuid, stepId));
}

/**
 * Draws the pieces of a playing simulation as plain meshes in the world and
 * moves them to each new set of transforms.
 */
export class PhysicsShatterPreview {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ color: PHYSICS_SHATTER_PREVIEW_COLOR });
  private readonly meshes: THREE.Mesh[];
  private readonly key: string;
  private readonly sceneRoot: THREE.Object3D;
  private readonly volumeUuid: string;

  /**
   * Adds the piece meshes to the scene and marks the modifier as previewing.
   *
   * @param sceneRoot Scene root the meshes are added to.
   * @param volumeUuid Owning volume uuid.
   * @param stepId Modifier id.
   * @param pieces Pieces in the modifier frame.
   * @param frameToWorld Modifier frame to world matrix.
   */
  constructor(
    sceneRoot: THREE.Object3D,
    volumeUuid: string,
    stepId: string,
    private readonly pieces: readonly PhysicsShatterPiece[],
    private readonly frameToWorld: THREE.Matrix4,
  ) {
    this.key = physicsShatterPreviewKey(volumeUuid, stepId);
    this.sceneRoot = sceneRoot;
    this.volumeUuid = volumeUuid;
    this.group.name = 'Physics Shatter Preview';
    this.meshes = pieces.map((piece) => this.meshCreate(piece));
    sceneRoot.add(this.group);
    physicsShatterPreviewsActive.add(this.key);
    this.stackCacheDrop();
  }

  /**
   * Moves every piece mesh to its transform.
   *
   * @param transforms Transform per piece in the modifier frame.
   */
  show(transforms: readonly PhysicsShatterPieceTransform[]): void {
    this.meshes.forEach((mesh, index) => {
      const piece = this.pieces[index];
      const transform = transforms[index];
      if (!piece || !transform) return;
      mesh.matrix.multiplyMatrices(this.frameToWorld, physicsShatterTransformMatrix(transform, piece.centroid));
      mesh.matrixWorldNeedsUpdate = true;
    });
  }

  /**
   * Runs an action with the piece meshes hidden, such as building colliders
   * from the visible scene.
   *
   * @param action Action to run.
   * @returns What the action returned.
   */
  whileHidden<T>(action: () => T): T {
    this.group.visible = false;
    try {
      return action();
    } finally {
      this.group.visible = true;
    }
  }

  /** Removes the meshes and lets the stack draw the modifier again. */
  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
    physicsShatterPreviewsActive.delete(this.key);
    this.stackCacheDrop();
  }

  /**
   * Forgets the volume's cached stack output, so the next evaluation shows or
   * hides its pieces.
   */
  private stackCacheDrop(): void {
    for (const model of SolidModelRegistry.collectUnder(this.sceneRoot)) {
      modifierStackCacheOf(model.root).delete(this.volumeUuid);
    }
  }

  /**
   * Builds one piece's mesh from its faces.
   *
   * @param piece Piece in the modifier frame.
   * @returns Mesh placed by matrix.
   */
  private meshCreate(piece: PhysicsShatterPiece): THREE.Mesh {
    const positions = physicsShatterPreviewTriangles(piece);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(this.frameToWorld);
    this.group.add(mesh);
    return mesh;
  }
}

/**
 * Returns the triangles of a piece's faces, each face fanned from its first
 * corner.
 *
 * @param piece Piece in the modifier frame.
 * @returns Flat x, y, z positions, three corners per triangle.
 */
function physicsShatterPreviewTriangles(piece: PhysicsShatterPiece): number[] {
  const positions: number[] = [];
  for (const face of piece.brush.faces) {
    const corners = piece.brush.getFaceVertices(face);
    const first = corners[0];
    if (!first) continue;
    for (let index = 1; index + 1 < corners.length; index++) {
      const second = corners[index];
      const third = corners[index + 1];
      if (second && third) positions.push(...first.toArray(), ...second.toArray(), ...third.toArray());
    }
  }
  return positions;
}
