import * as THREE from 'three';

/** Scratch matrix of the world pose a pinned mesh keeps. */
const PINNED_WORLD_SCRATCH = new THREE.Matrix4();

/** Scratch matrix that takes world coordinates into the mesh's parent. */
const PARENT_INVERSE_SCRATCH = new THREE.Matrix4();

/**
 * A mesh a generator shows on its volume until it is baked. It may be pinned to
 * an anchor, such as the solid that receives the volume's brushes: then it
 * stays where its evaluation put it relative to that anchor, however its parent
 * volume moves, until the next evaluation replaces it. Unpinned, it follows its
 * parent like any child.
 */
export class ModifierStackMeshShown extends THREE.Mesh {
  /** Object the mesh stays still against, or null to follow its parent. */
  private pinAnchor: THREE.Object3D | null = null;

  /** Pose of the mesh in the anchor's coordinates. */
  private readonly pinPose = new THREE.Matrix4();

  /**
   * Pins the mesh to an anchor at a world pose, or unpins it.
   *
   * @param anchor Object to stay still against, or null to follow the parent.
   * @param worldPose World matrix the mesh has now.
   */
  pinTo(anchor: THREE.Object3D | null, worldPose: THREE.Matrix4): void {
    this.pinAnchor = anchor;
    this.matrixAutoUpdate = anchor === null;
    if (!anchor) return;
    anchor.updateWorldMatrix(true, false);
    this.pinPose.copy(anchor.matrixWorld).invert().multiply(worldPose);
  }

  /**
   * Returns the anchor the mesh stays still against.
   *
   * @returns Anchor, or null when the mesh follows its parent.
   */
  pinnedAnchor(): THREE.Object3D | null {
    return this.pinAnchor;
  }

  /**
   * Copies another shown mesh, keeping its pin.
   *
   * @param source Mesh to copy.
   * @param recursive Copy the children too.
   * @returns This mesh.
   */
  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive);
    this.pinAnchor = source.pinAnchor;
    this.pinPose.copy(source.pinPose);
    return this;
  }

  /**
   * Places a pinned mesh at its pinned pose, then updates world matrices.
   *
   * @param force Update even when nothing is marked as changed.
   */
  override updateMatrixWorld(force?: boolean): void {
    this.pinnedLocalPoseWrite();
    super.updateMatrixWorld(force);
  }

  /**
   * Places a pinned mesh at its pinned pose after its parents and anchor are
   * current, then updates world matrices.
   *
   * @param updateParents Update the parents first.
   * @param updateChildren Update the children too.
   */
  override updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
    if (updateParents) {
      this.parent?.updateWorldMatrix(true, false);
      this.pinAnchor?.updateWorldMatrix(true, false);
    }
    this.pinnedLocalPoseWrite();
    super.updateWorldMatrix(false, updateChildren);
  }

  /**
   * Writes the local matrix that puts a pinned mesh at its pinned world pose.
   * The matrix is kept whole, since a turn inside a stretched volume cannot be
   * written as position, rotation and scale; those only follow it for readers.
   */
  private pinnedLocalPoseWrite(): void {
    if (!this.pinAnchor || !this.parent) return;
    PINNED_WORLD_SCRATCH.multiplyMatrices(this.pinAnchor.matrixWorld, this.pinPose);
    PARENT_INVERSE_SCRATCH.copy(this.parent.matrixWorld).invert();
    this.matrix.multiplyMatrices(PARENT_INVERSE_SCRATCH, PINNED_WORLD_SCRATCH);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }
}
