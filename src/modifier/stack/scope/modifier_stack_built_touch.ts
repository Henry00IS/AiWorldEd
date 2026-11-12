import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { ConvexPolygonClipper } from '@/solid/algorithm/surface/convex_polygon_clipper.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import {
  modifierStackBuiltBuries,
  modifierStackBuiltFaces,
  modifierStackBuiltSolidAt,
  modifierStackBuiltTouchingLeaves,
  type ModifierStackBuiltLeaf,
  type ModifierStackBuiltNode,
} from './modifier_stack_built_tree.js';

/** Distance of the two membership samples from a face, as the compiler uses. */
const MODIFIER_STACK_BUILT_SAMPLE_OFFSET = Math.max(SOLID_FAT_PLANE_EPSILON * 4, 1e-4);

/** Depth past which a piece inside a brush keeps both samples inside it. */
const MODIFIER_STACK_BUILT_DEEP = MODIFIER_STACK_BUILT_SAMPLE_OFFSET + SOLID_FAT_PLANE_EPSILON;

/** Squared area below which a clipped piece is treated as a sliver. */
const MODIFIER_STACK_BUILT_MIN_AREA_SQ = 1e-14;

/**
 * Finds the leaves whose built geometry meets the volume box: some part of one
 * of their faces lies inside the box and on the boundary of the solid the scope
 * builds, exactly the faces a collision system would collide with. Only the
 * brushes whose hull meets the box take part: their faces are clipped to the
 * box, split by the other touching brushes so membership is constant on each
 * piece, and a piece counts when the solid differs just in front of and just
 * behind it. Each brush stops at its first such piece.
 *
 * @param nodes Scope tree before the volume.
 * @param startsSolid True when the scope's fold starts solid.
 * @param volume Modifier volume.
 * @returns Leaves with built geometry inside the box, in CSG order.
 */
export function modifierStackBuiltTouched(
  nodes: readonly ModifierStackBuiltNode[],
  startsSolid: boolean,
  volume: THREE.Object3D,
): ModifierStackBuiltLeaf[] {
  const leaves = modifierStackBuiltTouchingLeaves(nodes);
  if (leaves.length === 0) return [];
  const box = modifierStackBuiltBoxPlanes(volume);
  if (!box) return [];
  return leaves.filter((leaf) => modifierStackBuiltLeafTouches(leaf, leaves, nodes, startsSolid, box));
}

/**
 * Tests one leaf's faces inside the box.
 *
 * @param leaf Leaf under test.
 * @param leaves Every touching leaf.
 * @param nodes Scope tree.
 * @param startsSolid Start state of the fold.
 * @param box Outward world planes of the volume box.
 * @returns True on the first boundary piece.
 */
function modifierStackBuiltLeafTouches(
  leaf: ModifierStackBuiltLeaf,
  leaves: readonly ModifierStackBuiltLeaf[],
  nodes: readonly ModifierStackBuiltNode[],
  startsSolid: boolean,
  box: SolidPlane[],
): boolean {
  const faces = modifierStackBuiltFaces(leaf.brush, leaf.toWorld);
  const others = leaves.filter((other) => other !== leaf);
  return faces.some((face, index) => {
    const normal = leaf.planes?.[index]?.normal;
    const inside = ConvexPolygonClipper.clipInsideAllPlanes(face, box);
    if (!normal || inside.length < 3) return false;
    return modifierStackBuiltPieceTouches(inside, others, { leaf, normal, nodes, startsSolid });
  });
}

/** What a piece is tested against. */
interface ModifierStackBuiltProbe {
  /** Leaf of the face. */
  leaf: ModifierStackBuiltLeaf;
  /** Outward face normal. */
  normal: THREE.Vector3;
  /** Scope tree. */
  nodes: readonly ModifierStackBuiltNode[];
  /** Start state of the fold. */
  startsSolid: boolean;
}

/**
 * Tests whether any part of a face piece is built geometry. A piece no brush
 * cuts across has the same solid on each side everywhere, so its centre
 * decides; otherwise it is split by the first brush that cuts across it and
 * each part is tested against the brushes after that one. A part wholly inside
 * a later brush that buries it is dropped at once. It stops on the first part
 * that is built geometry.
 *
 * @param piece Convex polygon on a brush face, inside the box.
 * @param others Touching leaves that may still cut across the piece.
 * @param probe Normal and scope tree.
 * @returns True when some part is built geometry.
 */
function modifierStackBuiltPieceTouches(
  piece: THREE.Vector3[],
  others: readonly ModifierStackBuiltLeaf[],
  probe: ModifierStackBuiltProbe,
): boolean {
  if (modifierStackBuiltAreaSq(piece) < MODIFIER_STACK_BUILT_MIN_AREA_SQ) return false;
  let cut = -1;
  for (let index = 0; index < others.length && cut < 0; index++) {
    const reach = modifierStackBuiltReach(piece, others[index]!.planes ?? []);
    if (reach === 'deep' && modifierStackBuiltBuries(probe.leaf, others[index]!)) return false;
    if (reach === 'across') cut = index;
  }
  if (cut < 0) return modifierStackBuiltOnBoundary(piece, probe.normal, probe.nodes, probe.startsSolid);
  const rest = others.slice(cut + 1);
  return modifierStackBuiltSplit(piece, others[cut]!).some((part) => modifierStackBuiltPieceTouches(part, rest, probe));
}

/**
 * Returns how a brush meets a piece: wholly outside one of its planes, wholly
 * inside all of them, deep inside them (farther in than the membership
 * samples), or cutting across it.
 *
 * @param piece Convex polygon.
 * @param planes Outward brush planes.
 * @returns Where the piece lies relative to the brush.
 */
function modifierStackBuiltReach(
  piece: readonly THREE.Vector3[],
  planes: readonly SolidPlane[],
): 'outside' | 'inside' | 'deep' | 'across' {
  let inside = true;
  let deep = true;
  for (const plane of planes) {
    let nearest = Infinity;
    let farthest = -Infinity;
    for (const point of piece) {
      const distance = plane.signedDistance(point);
      nearest = Math.min(nearest, distance);
      farthest = Math.max(farthest, distance);
    }
    if (nearest > SOLID_FAT_PLANE_EPSILON) return 'outside';
    if (farthest > SOLID_FAT_PLANE_EPSILON) inside = false;
    if (farthest > -MODIFIER_STACK_BUILT_DEEP) deep = false;
  }
  if (!inside) return 'across';
  return deep ? 'deep' : 'inside';
}

/**
 * Splits a piece into the part inside a brush and the parts outside it, so the
 * brush contains each result wholly or not at all.
 *
 * @param piece Convex polygon.
 * @param leaf Brush that splits it.
 * @returns Pieces.
 */
function modifierStackBuiltSplit(piece: THREE.Vector3[], leaf: ModifierStackBuiltLeaf): THREE.Vector3[][] {
  const output: THREE.Vector3[][] = [];
  let rest = piece;
  for (const plane of leaf.planes ?? []) {
    const parts = ConvexPolygonClipper.clipByPlane(rest, plane);
    if (parts.outside.length >= 3) output.push(parts.outside);
    rest = parts.inside;
    if (rest.length < 3) return output;
  }
  output.push(rest);
  return output;
}

/**
 * Returns whether a piece lies on the boundary of the built solid: the solid
 * just in front of the face differs from the solid just behind it.
 *
 * @param piece Convex polygon on a brush face.
 * @param normal Outward face normal.
 * @param nodes Scope tree.
 * @param startsSolid Start state of the fold.
 * @returns True for built geometry.
 */
function modifierStackBuiltOnBoundary(
  piece: THREE.Vector3[],
  normal: THREE.Vector3,
  nodes: readonly ModifierStackBuiltNode[],
  startsSolid: boolean,
): boolean {
  if (modifierStackBuiltAreaSq(piece) < MODIFIER_STACK_BUILT_MIN_AREA_SQ) return false;
  const center = new THREE.Vector3();
  for (const point of piece) center.add(point);
  center.multiplyScalar(1 / piece.length);
  const front = center.clone().addScaledVector(normal, MODIFIER_STACK_BUILT_SAMPLE_OFFSET);
  const back = center.clone().addScaledVector(normal, -MODIFIER_STACK_BUILT_SAMPLE_OFFSET);
  return modifierStackBuiltSolidAt(nodes, startsSolid, front) !== modifierStackBuiltSolidAt(nodes, startsSolid, back);
}

/**
 * Returns the squared doubled area of a convex polygon.
 *
 * @param polygon Polygon.
 * @returns Squared length of the summed fan cross products.
 */
function modifierStackBuiltAreaSq(polygon: readonly THREE.Vector3[]): number {
  const first = polygon[0];
  if (!first) return 0;
  const sum = new THREE.Vector3();
  for (let index = 1; index + 1 < polygon.length; index++) {
    const edgeA = polygon[index]!.clone().sub(first);
    sum.add(edgeA.cross(polygon[index + 1]!.clone().sub(first)));
  }
  return sum.lengthSq();
}

/**
 * Builds the six outward world planes of a volume box.
 *
 * @param volume Modifier volume.
 * @returns Planes, or null without box geometry or with a flat transform.
 */
export function modifierStackBuiltBoxPlanes(volume: THREE.Object3D): SolidPlane[] | null {
  const geometry = (volume as THREE.Mesh).geometry;
  if (!geometry || Math.abs(volume.matrixWorld.determinant()) < 1e-10) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const center = box.getCenter(new THREE.Vector3()).applyMatrix4(volume.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(volume.matrixWorld);
  const sides: [THREE.Vector3, THREE.Vector3][] = [];
  for (const axis of [0, 1, 2]) {
    const direction = new THREE.Vector3().setComponent(axis, 1);
    sides.push([direction, new THREE.Vector3().copy(box.max)], [direction.clone().negate(), box.min.clone()]);
  }
  return sides.map(([direction, corner]) => {
    const normal = direction.applyMatrix3(normalMatrix).normalize();
    const plane = new SolidPlane(normal, -normal.dot(corner.applyMatrix4(volume.matrixWorld)));
    return plane.signedDistance(center) > 0 ? new SolidPlane(normal.clone().negate(), -plane.offset) : plane;
  });
}
