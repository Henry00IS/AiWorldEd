import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { SolidFace } from '@/solid/types/wing_edge.js';
import type { SolidScriptUseFaceTexture } from '@/solid_script/language/solid_script_system.js';

/**
 * Texture and UV of every face of the received brushes, in script space: the
 * volume frame, centred on the received bounds, the same space as the corners.
 *
 * @param brushes Received brushes.
 * @param toFrame Model-to-volume-frame matrix.
 * @param origin Script origin in frame coordinates.
 * @returns One list per brush.
 */
export function modifierStackSolidScriptReceivedFaces(
  brushes: readonly SolidBrushInstance[],
  toFrame: THREE.Matrix4,
  origin: THREE.Vector3,
): SolidScriptUseFaceTexture[][] {
  return brushes.map((brush) => {
    const placed = brush.getModelSpaceBrush();
    placed.transformVertices(toFrame);
    const toLocal = modifierStackSolidScriptReceivedToLocal(brush, toFrame, origin);
    return placed.faces.map((face, index) =>
      modifierStackSolidScriptReceivedFace(brush, placed, face, index, origin, toLocal),
    );
  });
}

/**
 * Matrix that takes a script-space point back into the brush's local space, so
 * an authored UV matrix can be rewritten for the corners the script reads.
 *
 * @param brush Received brush.
 * @param toFrame Model-to-volume-frame matrix.
 * @param origin Script origin in frame coordinates.
 * @returns Script-to-local matrix.
 */
function modifierStackSolidScriptReceivedToLocal(
  brush: SolidBrushInstance,
  toFrame: THREE.Matrix4,
  origin: THREE.Vector3,
): THREE.Matrix4 {
  return brush
    .getModelSpaceMatrix()
    .clone()
    .invert()
    .multiply(toFrame.clone().invert())
    .multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z));
}

/**
 * One received face: its middle, direction, texture, and UV matrix, all in
 * script space.
 *
 * @param brush Received brush.
 * @param placed Model-space brush already moved into the volume frame.
 * @param face Face.
 * @param index Face index.
 * @param origin Script origin in frame coordinates.
 * @param toLocal Script-to-local matrix.
 * @returns Record.
 */
function modifierStackSolidScriptReceivedFace(
  brush: SolidBrushInstance,
  placed: SolidBrush,
  face: SolidFace,
  index: number,
  origin: THREE.Vector3,
  toLocal: THREE.Matrix4,
): SolidScriptUseFaceTexture {
  const points = placed.getFaceVertices(face);
  const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const normal = placed.planes[index]!.normal;
  return {
    point: [middle.x - origin.x, middle.y - origin.y, middle.z - origin.z] as const,
    normal: [normal.x, normal.y, normal.z] as const,
    texture: brush.getSurfaceTextureId(face.surfaceIndex),
    uv: brush.getFaceSurface(face.surfaceIndex).uv.multiplyMatrix4(toLocal),
  };
}
