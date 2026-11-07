import * as THREE from 'three';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { GeneratorSettings } from './modifier_generator_types.js';

/**
 * Bakes a rigid or reflected copy without registering authored objects. @param
 * source Source brush. @param matrix Local-to-model pose. @param id Derived
 * ID.
 *
 * @param settings Mapping policy.
 */
export function generatorCopyBrush(
  source: SolidBrushInstance,
  matrix: THREE.Matrix4,
  id: string,
  settings: GeneratorSettings,
): SolidBrushInstance {
  const brush = source.brush.clone();
  brush.transformVertices(matrix);
  if (matrix.determinant() < 0) generatorReverseWinding(brush);
  const copy = new SolidBrushInstance(id, source.name, brush, source.operation);
  const inverse = matrix.clone().invert();
  const sourcePose = source.getModelSpaceMatrix();
  const uvPose = settings.uv === 'world' ? sourcePose.clone().invert() : inverse;
  const mirrored = matrix.determinant() * sourcePose.determinant() < 0;
  const surfaces = source.brush.faces.map((_, index) =>
    generatorCopySurface(source, index, uvPose, mirrored, settings),
  );
  copy.restoreFaceSurfaces(source.serializeDefaultSurface(), surfaces);
  copy.mesh = new THREE.Mesh();
  copy.mesh.userData['generatorDerived'] = true;
  copy.mesh.userData['generatorSourceId'] = source.id;
  copy.mesh.userData['isSolidBrush'] = true;
  SolidBrushVisual.setBrushId(copy.mesh, id);
  return copy;
}
/**
 * Preserves surface coordinates, optionally correcting mirrored text. @param
 * source Brush. @param index Face. @param pose Coordinate inverse. @param
 * mirrored Reflection flag. @param settings Mapping policy.
 */
function generatorCopySurface(
  source: SolidBrushInstance,
  index: number,
  pose: THREE.Matrix4,
  mirrored: boolean,
  settings: GeneratorSettings,
) {
  const surface = source.getFaceSurface(index);
  surface.uv = surface.uv.multiplyMatrix4(pose);
  if (mirrored && settings.uv === 'copied' && settings.parameters['readable'] !== false) {
    surface.uv.u.multiplyScalar(-1);
    surface.uv.u.w += 1;
  }
  return surface;
}
/**
 * Reverses face loops and re-links twins after reflection. @param brush
 * Reflected convex shell.
 */
function generatorReverseWinding(brush: SolidBrushInstance['brush']): void {
  for (const face of brush.faces) {
    const indices = brush.getFaceVertexIndices(face).reverse();
    indices.forEach((vertexIndex, offset) => {
      const edge = brush.wingEdges[face.firstEdge + offset];
      if (edge) edge.vertexIndex = vertexIndex;
    });
  }
  generatorRelinkTwins(brush);
  brush.recalculatePlanes();
}
/**
 * Reconstructs twin references from reversed directed edges. @param brush
 * Closed shell.
 */
function generatorRelinkTwins(brush: SolidBrushInstance['brush']): void {
  const directed = new Map<string, number>();
  for (const face of brush.faces) {
    for (let offset = 0; offset < face.edgeCount; offset++) {
      const index = face.firstEdge + offset;
      const start = brush.wingEdges[index];
      const end = brush.wingEdges[face.firstEdge + ((offset + 1) % face.edgeCount)];
      if (start && end) directed.set(`${start.vertexIndex}:${end.vertexIndex}`, index);
    }
  }
  for (const [key, index] of directed) {
    const [start, end] = key.split(':');
    const edge = brush.wingEdges[index];
    if (edge) edge.twinIndex = directed.get(`${end}:${start}`) ?? -1;
  }
}
