import * as THREE from 'three';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { generatorRevolveRing, type GeneratorRevolveFrame } from './generator_revolve_brush.js';
import { generatorRevolvePerimeter } from './generator_revolve_perimeter.js';
import { generatorRevolveSectionPhase } from './generator_revolve_section.js';
import type { GeneratorRevolveUvLayout } from './generator_revolve_surface.js';

/** A mapped triangle corner. */
interface GeneratorRevolveMappedCorner {
  /** Face point. */
  point: THREE.Vector3;
  /** Perimeter turn and continuous profile arc length. */
  uv: THREE.Vector2;
}

/**
 * Fits an affine texture matrix to one planar triangle of a twisted band.
 *
 * @param corners Planar face corners.
 * @param frame Cross-section settings.
 * @param layout Continuous texture layout.
 * @returns Matrix matching the triangle's corner coordinates.
 */
export function generatorRevolveTwistUv(
  corners: readonly THREE.Vector3[],
  frame: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): SurfaceUvMatrix {
  const mapped = corners
    .slice(0, 3)
    .map((point) => ({ point, uv: generatorRevolveTwistCornerUv(point, frame, layout) }));
  const [a, b, c] = mapped;
  if (!a || !b || !c) return new SurfaceUvMatrix(new THREE.Vector4(), new THREE.Vector4());
  for (const corner of mapped) corner.uv.x -= Math.round((corner.uv.x - a.uv.x) / layout.around) * layout.around;
  return new SurfaceUvMatrix(generatorRevolveTwistRow(a, b, c, 'x'), generatorRevolveTwistRow(a, b, c, 'y'));
}

/**
 * Measures one triangle corner against its rotated ring.
 *
 * @param point Face vertex.
 * @param frame Cross-section settings.
 * @param layout Continuous texture layout.
 * @returns Perimeter U and running profile V.
 */
function generatorRevolveTwistCornerUv(
  point: THREE.Vector3,
  frame: GeneratorRevolveFrame,
  layout: GeneratorRevolveUvLayout,
): THREE.Vector2 {
  const height = point.y - frame.center.y;
  const nearest = Math.min(...layout.arcs.map((arc) => Math.abs(arc.height - height)));
  const candidates = layout.arcs.filter((arc) => Math.abs(arc.height - height) <= nearest + 1e-6);
  let best = { distance: Infinity, uv: new THREE.Vector2() };
  for (const arc of candidates) {
    const matched = generatorRevolveTwistRingUv(point, frame, arc, layout);
    if (matched.distance < best.distance) best = matched;
  }
  return best.uv;
}

/**
 * Matches a face point to a sampled ring corner and measures its perimeter U.
 *
 * @param point Face point.
 * @param frame Section settings.
 * @param arc Sampled ring with continuous profile distance.
 * @param layout Texture scale and seam settings.
 * @returns Nearest corner distance and its texture coordinates.
 */
function generatorRevolveTwistRingUv(
  point: THREE.Vector3,
  frame: GeneratorRevolveFrame,
  arc: GeneratorRevolveUvLayout['arcs'][number],
  layout: GeneratorRevolveUvLayout,
): { distance: number; uv: THREE.Vector2 } {
  const ring = generatorRevolveRing(frame, arc);
  const perimeter = Math.max(generatorRevolvePerimeter(ring), 1e-9);
  let walked = 0;
  const match = { distance: Infinity, uv: new THREE.Vector2() };
  ring.forEach((vertex, index) => {
    const distance = vertex.distanceToSquared(point);
    if (distance < match.distance) {
      match.distance = distance;
      match.uv.set(
        (1 - walked / perimeter + generatorRevolveSectionPhase(frame, layout.sides)) * layout.around,
        arc.length * layout.alongPerMetre,
      );
    }
    walked += vertex.distanceTo(ring[(index + 1) % ring.length] ?? vertex);
  });
  return match;
}

/**
 * Solves one affine UV row from three non-collinear face points.
 *
 * @param a First mapped corner.
 * @param b Second mapped corner.
 * @param c Third mapped corner.
 * @param axis U or V component.
 * @returns World-to-texture row.
 */
function generatorRevolveTwistRow(
  a: GeneratorRevolveMappedCorner,
  b: GeneratorRevolveMappedCorner,
  c: GeneratorRevolveMappedCorner,
  axis: 'x' | 'y',
): THREE.Vector4 {
  const ab = b.point.clone().sub(a.point),
    ac = c.point.clone().sub(a.point);
  const uu = ab.lengthSq(),
    vv = ac.lengthSq(),
    uv = ab.dot(ac);
  const determinant = uu * vv - uv * uv;
  if (Math.abs(determinant) < 1e-18) return new THREE.Vector4(0, 0, 0, a.uv[axis]);
  const du = b.uv[axis] - a.uv[axis],
    dv = c.uv[axis] - a.uv[axis];
  const gradient = ab
    .multiplyScalar((du * vv - dv * uv) / determinant)
    .addScaledVector(ac, (dv * uu - du * uv) / determinant);
  return new THREE.Vector4(gradient.x, gradient.y, gradient.z, a.uv[axis] - gradient.dot(a.point));
}
