import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { MODIFIER_SMOOTH_FLAT } from '@/modifier/smooth/modifier_smooth_shading.js';
import type { GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { GeneratorRevolvePerimeterLayout } from './generator_revolve_perimeter.js';
import { generatorRevolveSharpVertices, generatorRevolveSideNormal } from './generator_revolve_corner.js';

/**
 * Keeps real section corners hard while allowing smooth arcs and twist ribbons.
 *
 * @param brush Convex column piece.
 * @param frame Cross-section settings at the piece bottom.
 * @returns Smoothing class per face.
 */
export function generatorRevolveSmoothClasses(brush: SolidBrush, frame: GeneratorRevolveFrame): number[] {
  const perimeter = new GeneratorRevolvePerimeterLayout(frame);
  return brush.planes.map((plane, index) => {
    if (Math.abs(plane.normal.y) > 0.999) return MODIFIER_SMOOTH_FLAT;
    const face = brush.faces[index];
    const corners = face ? brush.getFaceVertexIndices(face).map((corner) => brush.vertices[corner]) : [];
    const edge = perimeter.edgeOfFace(
      plane.normal,
      corners.filter((corner): corner is THREE.Vector3 => !!corner),
    );
    const flat = generatorRevolveEdgeFlat(frame, edge.normal);
    return flat ? (frame.twisted ? edge.index + 1 : MODIFIER_SMOOTH_FLAT) : 0;
  });
}

/**
 * Distinguishes a true flat side from a fillet arc.
 *
 * @param frame Section settings and starting orientation.
 * @param normal Unit-ring edge normal.
 * @returns Whether the edge belongs to a hard-sided ribbon.
 */
function generatorRevolveEdgeFlat(frame: GeneratorRevolveFrame, normal: THREE.Vector3): boolean {
  if (frame.section === 'cross' || frame.section === 'bar') return true;
  const local = normal
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(frame.rotation ?? 0));
  if (frame.section === 'stadium') return Math.abs(local.z) > 1 - 1e-9;
  if (frame.section !== 'square' && frame.section !== 'polygon') return false;
  if ((frame.cornerSides ?? 1) === 1) return true;
  const vertices = generatorRevolveSharpVertices(frame.section === 'polygon' ? (frame.polygonSides ?? 6) : undefined);
  const aspect = frame.aspect ?? 1;
  const stretched = vertices.map((vertex) => new THREE.Vector2(vertex.x, vertex.y * aspect));
  return stretched.some((vertex, index) => {
    const side = generatorRevolveSideNormal(vertex, stretched[(index + 1) % stretched.length] ?? vertex);
    return side.x * local.x + side.y * local.z > 1 - 1e-9;
  });
}
