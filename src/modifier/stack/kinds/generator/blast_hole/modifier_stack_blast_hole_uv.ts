import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/**
 * Largest distance, in metres, at which a piece edge counts as lying on the
 * outline.
 */
export const BLAST_HOLE_UV_ON_OUTLINE = 1e-6;

/** Smallest |normal.z| of a face lying in the front or back of the box. */
const BLAST_HOLE_UV_CAP_NORMAL = 0.5;

/**
 * Lays the texture around the cut faces of a hole: U is the distance walked
 * along the outline, V the depth from the front of the box, both in metres, so
 * the texture runs on unbroken around the hole at one tile per metre. The one
 * seam sits at the top of the outline.
 */
export class BlastHoleUvWrap {
  /** Outline points around the box centre, counter-clockwise. */
  private readonly outline: readonly THREE.Vector2[];
  /** Distance along the outline at each point, from the seam. */
  private readonly starts: readonly number[];

  /**
   * Measures the outline.
   *
   * @param outline Outline points around the box centre, counter-clockwise.
   */
  constructor(outline: readonly THREE.Vector2[]) {
    this.outline = outline;
    this.starts = blastHoleUvArcStarts(outline);
  }

  /**
   * Returns the U row of a cut face lying on the outline, in coordinates around
   * the box centre.
   *
   * @param a First end of the face's edge in the outline plane.
   * @param b Other end.
   * @returns U row, or null when the edge is not on the outline.
   */
  rowOn(a: THREE.Vector2, b: THREE.Vector2): THREE.Vector4 | null {
    const count = this.outline.length;
    for (let index = 0; index < count; index++) {
      const from = this.outline[index];
      const to = this.outline[(index + 1) % count];
      if (!from || !to || !blastHoleUvOnSegment(a, from, to) || !blastHoleUvOnSegment(b, from, to)) continue;
      const along = to.clone().sub(from).normalize();
      return new THREE.Vector4(along.x, along.y, 0, (this.starts[index] ?? 0) - along.dot(from));
    }
    return null;
  }
}

/**
 * Measures the distance along a closed outline at each point, starting at the
 * highest point (the first of equals) and growing counter-clockwise.
 *
 * @param outline Closed outline.
 * @returns Distance at each point, in metres.
 */
export function blastHoleUvArcStarts(outline: readonly THREE.Vector2[]): number[] {
  const count = outline.length;
  let seam = 0;
  outline.forEach((point, index) => {
    if (point.y > (outline[seam]?.y ?? -Infinity)) seam = index;
  });
  const starts = new Array<number>(count).fill(0);
  let walked = 0;
  for (let step = 0; step < count; step++) {
    const index = (seam + step) % count;
    starts[index] = walked;
    walked += (outline[index] ?? new THREE.Vector2()).distanceTo(outline[(index + 1) % count] ?? new THREE.Vector2());
  }
  return starts;
}

/**
 * Returns whether a point lies on a segment.
 *
 * @param point Point.
 * @param from Segment start.
 * @param to Segment end.
 * @returns True within {@link BLAST_HOLE_UV_ON_OUTLINE}.
 */
function blastHoleUvOnSegment(point: THREE.Vector2, from: THREE.Vector2, to: THREE.Vector2): boolean {
  const span = to.clone().sub(from);
  const length = span.lengthSq();
  const t = length > 0 ? THREE.MathUtils.clamp(point.clone().sub(from).dot(span) / length, 0, 1) : 0;
  return from.clone().addScaledVector(span, t).distanceTo(point) <= BLAST_HOLE_UV_ON_OUTLINE;
}

/**
 * Returns the U row of a cut face off the outline, such as the face between two
 * pieces: U runs along the face, pointing the same way whichever of the two
 * pieces owns it, so both sides of the cut get the same UVs.
 *
 * @param normal Face normal.
 * @returns U row in coordinates around the box centre.
 */
export function blastHoleUvSplitRow(normal: THREE.Vector3): THREE.Vector4 {
  const along = new THREE.Vector2(-normal.y, normal.x).normalize();
  const flip = along.x < -1e-9 || (Math.abs(along.x) <= 1e-9 && along.y < 0);
  if (flip) along.negate();
  return new THREE.Vector4(along.x, along.y, 0, 0);
}

/**
 * Builds the frame-space surfaces of one Blast Hole piece: cut faces wrap
 * around the hole (or run along split faces) with V across the wall from its
 * front, and front and back faces lie flat on the box. One tile is one metre;
 * the texture slot's scale, offset and rotation apply on top.
 *
 * @param piece Piece in frame coordinates, extruded along Z.
 * @param box Volume box in frame coordinates.
 * @param wrap Outline wrap, or null when the pieces have no outline, as bricks.
 * @returns Surface per surface index.
 */
export function blastHoleUvSurfaces(
  piece: SolidBrush,
  box: THREE.Box3,
  wrap: BlastHoleUvWrap | null,
): FaceSurfaceDescription[] {
  const center = box.getCenter(new THREE.Vector3());
  const surfaces: FaceSurfaceDescription[] = [];
  piece.faces.forEach((face, index) => {
    const normal = piece.planes[index]?.normal ?? new THREE.Vector3(0, 0, 1);
    const corners = piece.getFaceVertexIndices(face).map((corner) => piece.vertices[corner] ?? new THREE.Vector3());
    const uv =
      Math.abs(normal.z) > BLAST_HOLE_UV_CAP_NORMAL
        ? SurfaceUvMatrix.fromTrs(new THREE.Vector2(), normal, 0, 1, 1)
        : blastHoleUvSide(normal, corners, center, box.max.z, wrap);
    surfaces[face.surfaceIndex] = { textureId: DEFAULT_CHECKER_TEXTURE_ID, uv };
  });
  return surfaces;
}

/**
 * Builds the UVs of one cut face of a piece.
 *
 * @param normal Face normal.
 * @param corners Face corners in frame coordinates.
 * @param center Box centre.
 * @param front Z of the front of the box.
 * @param wrap Outline wrap, or null.
 * @returns UV matrix in frame coordinates.
 */
function blastHoleUvSide(
  normal: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  center: THREE.Vector3,
  front: number,
  wrap: BlastHoleUvWrap | null,
): SurfaceUvMatrix {
  const flat = corners.map((corner) => new THREE.Vector2(corner.x - center.x, corner.y - center.y));
  const [a, b] = blastHoleUvFarthest(flat);
  const row = (a && b && wrap?.rowOn(a, b)) || blastHoleUvSplitRow(normal);
  const u = new THREE.Vector4(row.x, row.y, 0, row.w - row.x * center.x - row.y * center.y);
  return new SurfaceUvMatrix(u, new THREE.Vector4(0, 0, -1, front));
}

/**
 * Picks the two points of a face edge seen end-on that lie farthest apart,
 * which are the two ends of the face's outline edge.
 *
 * @param points Face corners in the outline plane.
 * @returns The two ends, or empties for a face of fewer than two corners.
 */
function blastHoleUvFarthest(points: readonly THREE.Vector2[]): (THREE.Vector2 | undefined)[] {
  let best: (THREE.Vector2 | undefined)[] = [points[0], points[1]];
  let reach = -1;
  for (const a of points)
    for (const b of points) if (a.distanceToSquared(b) > reach) [best, reach] = [[a, b], a.distanceToSquared(b)];
  return best;
}
