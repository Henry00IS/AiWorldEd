import * as THREE from 'three';

/** Bakes a profile transform into a detached FBX export scene. */
export class FbxSceneCoordinateBaker {
  /**
   * Bakes the supplied coordinate transform into every exportable node.
   *
   * @param exportRoot Detached FBX export scene.
   * @param coordinateTransform Editor-to-target coordinate transform.
   */
  bake(exportRoot: THREE.Object3D, coordinateTransform: THREE.Matrix4): void {
    const inverseTransform = new THREE.Matrix4().copy(coordinateTransform).invert();
    exportRoot.children.forEach((child) => this.bakeNode(child, coordinateTransform, inverseTransform));
  }

  /**
   * Bakes the coordinate transform into one node and its descendants.
   *
   * @param node Current export node.
   * @param coordinateTransform Editor-to-target coordinate transform.
   * @param inverseTransform Inverse of the editor-to-target transform.
   */
  private bakeNode(node: THREE.Object3D, coordinateTransform: THREE.Matrix4, inverseTransform: THREE.Matrix4): void {
    const sourceLocalMatrix = this.readLocalMatrix(node);
    const targetLocalMatrix = this.buildTargetLocalMatrix(sourceLocalMatrix, coordinateTransform, inverseTransform);
    this.applyLocalMatrix(node, targetLocalMatrix);
    this.bakeMeshGeometry(node, coordinateTransform);
    node.children.forEach((child) => this.bakeNode(child, coordinateTransform, inverseTransform));
  }

  /**
   * Reads the current local matrix before replacing the node transform.
   *
   * @param node Export node.
   * @returns Current local transform matrix.
   */
  private readLocalMatrix(node: THREE.Object3D): THREE.Matrix4 {
    node.updateMatrix();
    return node.matrix.clone();
  }

  /**
   * Converts a local transform into the target coordinate basis.
   *
   * @param sourceLocalMatrix Editor-space local transform.
   * @param coordinateTransform Editor-to-target coordinate transform.
   * @param inverseTransform Inverse of the editor-to-target transform.
   * @returns Target-space local transform.
   */
  private buildTargetLocalMatrix(
    sourceLocalMatrix: THREE.Matrix4,
    coordinateTransform: THREE.Matrix4,
    inverseTransform: THREE.Matrix4,
  ): THREE.Matrix4 {
    return new THREE.Matrix4().multiplyMatrices(coordinateTransform, sourceLocalMatrix).multiply(inverseTransform);
  }

  /**
   * Stores a target-space matrix without decomposing a reflected root.
   *
   * @param node Export node receiving the transform.
   * @param targetLocalMatrix Target-space local transform.
   */
  private applyLocalMatrix(node: THREE.Object3D, targetLocalMatrix: THREE.Matrix4): void {
    node.matrixAutoUpdate = false;
    node.matrix.copy(targetLocalMatrix);
    node.matrixWorldNeedsUpdate = true;
  }

  /**
   * Clones and transforms mesh geometry so the source geometry remains intact.
   *
   * @param node Candidate export node.
   * @param coordinateTransform Editor-to-target coordinate transform.
   */
  private bakeMeshGeometry(node: THREE.Object3D, coordinateTransform: THREE.Matrix4): void {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.geometry = node.geometry.clone();
    node.geometry.applyMatrix4(coordinateTransform);
  }
}
