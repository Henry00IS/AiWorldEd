import * as THREE from 'three';

/**
 * Bakes an axis and unit conversion into an export scene instead of placing it
 * on a root node: every node's local transform is conjugated by `matrix` and
 * every mesh's geometry is transformed by it, so the scene ends up converted
 * while nodes keep their own rotation and scale (unrotated nodes stay
 * unrotated). `matrix` must be a rotation that maps axes onto axes, times a
 * uniform scale. Geometry is cloned first; it is shared with the live scene.
 *
 * @param root Export scene (detached clone).
 * @param matrix Conversion matrix.
 */
export function exportSceneBake(root: THREE.Object3D, matrix: THREE.Matrix4): void {
  const inverse = matrix.clone().invert();
  root.traverse((object) => {
    object.updateMatrix();
    object.matrix.premultiply(matrix).multiply(inverse);
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    roundTransform(object);
    if (object instanceof THREE.Mesh) {
      object.geometry = (object.geometry as THREE.BufferGeometry).clone().applyMatrix4(matrix);
    }
  });
}

/**
 * Snaps float noise from the conversion (1e-16 rotations, -0) to exact values.
 *
 * @param object Node to tidy.
 */
function roundTransform(object: THREE.Object3D): void {
  const snap = (value: number) => {
    const rounded = Math.round(value * 1e9) / 1e9;
    return rounded === 0 ? 0 : rounded;
  };
  object.position.set(snap(object.position.x), snap(object.position.y), snap(object.position.z));
  object.scale.set(snap(object.scale.x), snap(object.scale.y), snap(object.scale.z));
  const q = object.quaternion;
  q.set(snap(q.x), snap(q.y), snap(q.z), snap(q.w)).normalize();
}
