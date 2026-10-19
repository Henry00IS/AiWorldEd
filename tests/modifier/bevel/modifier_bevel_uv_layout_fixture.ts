import * as THREE from 'three';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelSharedEdge } from '@/modifier/bevel/modifier_bevel_face_graph.js';
import { modifierBevelProfileChain } from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM,
  type ModifierBevelUvLayout,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Measures one layout on the first profile strip.
 *
 * @param layout UV layout.
 * @returns Edge samples and face bounds.
 */
export function placeLayout(layout: ModifierBevelUvLayout): {
  record: ModifierBevelDerivedBrush['faces'][number];
  atA: { u: number; v: number };
  atB: { u: number; v: number };
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
} {
  const { instance, derived, index } = derivedLayout(layout);
  const record = derived.faces[index];
  const edge = record?.chamferEdge;
  if (!record || !edge) throw new Error('expected a strip');
  const surface = modifierBevelResolveDerivedSurface(instance, derived, index);
  const bounds = uvBounds(surface, derived, index);
  return { record, atA: surface.uv.project(edge.pointA), atB: surface.uv.project(edge.pointB), ...bounds };
}

/**
 * Derives a chamfered box with one layout.
 *
 * @param layout UV layout.
 * @returns Instance, derived brush, and a strip face.
 */
export function derivedLayout(layout: ModifierBevelUvLayout): {
  instance: SolidBrushInstance;
  derived: ModifierBevelDerivedBrush;
  index: number;
} {
  const { instance, volume } = boxAndVolume();
  ModifierVolumeBevel.writeUvLayout(volume, layout);
  const derived = derive(instance, volume);
  return { instance, derived, index: stripIndex(derived) };
}

/**
 * Builds a box and a covering chamfer volume.
 *
 * @returns Instance and volume.
 */
export function boxAndVolume(): { instance: SolidBrushInstance; volume: THREE.Mesh } {
  return { instance: boxInstance(), volume: layoutVolume(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE) };
}

/**
 * Builds a unit box instance.
 *
 * @returns Instance with an identity mesh.
 */
export function boxInstance(): SolidBrushInstance {
  const instance = new SolidBrushInstance('brush-layout', 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Builds a covering bevel volume.
 *
 * @param layout UV layout.
 * @returns Volume.
 */
export function layoutVolume(layout: ModifierBevelUvLayout): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  ModifierVolumeBevel.writeUvLayout(volume, layout);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Derives one brush.
 *
 * @param instance Authored brush.
 * @param volume Bevel volume.
 * @returns Derived brush.
 */

/** One resolved generated face. */
export interface PlacedLayout {
  /** Authored brush. */
  instance: SolidBrushInstance;
  /** Chamfered brush. */
  derived: ModifierBevelDerivedBrush;
  /** Strip face index. */
  index: number;
  /** Resolved surface. */
  surface: FaceSurfaceDescription;
}

/**
 * Derives one layout on a moved and scaled brush.
 *
 * @param layout UV layout.
 * @param scale Brush scale.
 * @param position Brush position.
 * @returns Resolved strip.
 */
export function posedLayout(
  layout: ModifierBevelUvLayout,
  scale: THREE.Vector3,
  position: THREE.Vector3,
): PlacedLayout {
  const { instance, volume } = boxAndVolume();
  const mesh = brushMesh(instance);
  mesh.scale.copy(scale);
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
  ModifierVolumeBevel.writeUvLayout(volume, layout);
  const derived = derive(instance, volume);
  const index = stripIndex(derived);
  return { instance, derived, index, surface: modifierBevelResolveDerivedSurface(instance, derived, index) };
}

/**
 * Returns whether the edge UV span matches its world length.
 *
 * @param layout Tile or trim.
 * @param scale Brush scale.
 * @returns True when U follows the transformed edge.
 */
export function edgeMatchesWorldLength(layout: ModifierBevelUvLayout, scale: THREE.Vector3): boolean {
  const placed = posedLayout(layout, scale, new THREE.Vector3());
  const edge = placed.derived.faces[placed.index]?.chamferEdge;
  if (!edge) return false;
  const length = worldDistance(edge.pointA, edge.pointB, brushWorld(placed.instance));
  const atA = placed.surface.uv.project(edge.pointA);
  const atB = placed.surface.uv.project(edge.pointB);
  return Math.abs(atA.v - atB.v) < 1e-3 && Math.abs(Math.abs(atA.u - atB.u) - length) < 1e-3;
}

/**
 * Returns the world distance between two local points.
 *
 * @param left Local point.
 * @param right Local point.
 * @param matrix Brush local-to-world matrix.
 * @returns Distance.
 */
function worldDistance(left: THREE.Vector3, right: THREE.Vector3, matrix: THREE.Matrix4): number {
  return left.clone().applyMatrix4(matrix).distanceTo(right.clone().applyMatrix4(matrix));
}

/**
 * Returns whether trim still fits one copy across the scaled face.
 *
 * @param scale Brush scale.
 * @returns True when V spans one texture.
 */
export function trimWidthStaysOneCopy(scale: THREE.Vector3): boolean {
  const placed = posedLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, scale, new THREE.Vector3());
  const bounds = uvBounds(placed.surface, placed.derived, placed.index);
  return bounds.maxV - bounds.minV > 0.99 && bounds.maxV - bounds.minV < 1.01;
}

/**
 * Returns whether a tile sample off the edge keeps square world spacing.
 *
 * @param scale Brush scale.
 * @returns True when U and V match world along and across distances.
 */
export function tileFollowsWorldEdge(scale: THREE.Vector3): boolean {
  const placed = posedLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TILE, scale, new THREE.Vector3());
  const edge = placed.derived.faces[placed.index]?.chamferEdge;
  const off = offEdgePoint(placed.derived, placed.index, edge);
  if (!edge || !off) return false;
  return worldTileError(placed.surface, off, edge.pointA, edge.pointB, brushWorld(placed.instance)) < 1e-3;
}

/**
 * Returns a face vertex that is not an endpoint of the bevel edge.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @param edge Bevel edge, or null.
 * @returns Vertex, or null.
 */
function offEdgePoint(
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  edge: { pointA: THREE.Vector3; pointB: THREE.Vector3 } | null | undefined,
): THREE.Vector3 | null {
  if (!edge) return null;
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  return points.find((point) => point.distanceTo(edge.pointA) > 1e-4 && point.distanceTo(edge.pointB) > 1e-4) ?? null;
}

/**
 * Returns how far a tile UV is from the world edge frame.
 *
 * @param surface Face surface.
 * @param point Local sample.
 * @param edgeA Edge start.
 * @param edgeB Edge end.
 * @param matrix Brush local-to-world matrix.
 * @returns Error in UV units.
 */
function worldTileError(
  surface: FaceSurfaceDescription,
  point: THREE.Vector3,
  edgeA: THREE.Vector3,
  edgeB: THREE.Vector3,
  matrix: THREE.Matrix4,
): number {
  const measured = worldEdgeDistances(point, edgeA, edgeB, matrix);
  const uv = surface.uv.project(point);
  const origin = surface.uv.project(edgeA);
  const alongError = Math.abs(uv.u - origin.u - measured.along);
  const acrossError = Math.abs(Math.abs(uv.v - origin.v) - measured.perp);
  return Math.max(alongError, acrossError);
}

/**
 * Measures world distance along an edge and away from it.
 *
 * @param point Local sample.
 * @param edgeA Edge start.
 * @param edgeB Edge end.
 * @param matrix Brush local-to-world matrix.
 * @returns Along and perpendicular distances.
 */
function worldEdgeDistances(
  point: THREE.Vector3,
  edgeA: THREE.Vector3,
  edgeB: THREE.Vector3,
  matrix: THREE.Matrix4,
): { along: number; perp: number } {
  const start = edgeA.clone().applyMatrix4(matrix);
  const direction = edgeB.clone().applyMatrix4(matrix).sub(start);
  const length = direction.length();
  if (length <= 1e-8) return { along: 0, perp: 0 };
  direction.multiplyScalar(1 / length);
  const relative = point.clone().applyMatrix4(matrix).sub(start);
  const along = relative.dot(direction);
  const perp = relative.clone().sub(direction.clone().multiplyScalar(along)).length();
  return { along, perp };
}

/**
 * Returns whether stretch still covers the scaled face once.
 *
 * @param scale Brush scale.
 * @returns True when U and V each span one copy.
 */
export function stretchCoversFace(scale: THREE.Vector3): boolean {
  const placed = posedLayout(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH, scale, new THREE.Vector3());
  const bounds = uvBounds(placed.surface, placed.derived, placed.index);
  return bounds.minU > -1e-3 && bounds.minV > -1e-3 && bounds.maxU > 0.9 && bounds.maxV > 0.99;
}

/**
 * Returns the UV length of one world-space step.
 *
 * @param placed Resolved strip.
 * @param direction World direction.
 * @returns UV length.
 */
export function stepUvLength(placed: PlacedLayout, direction: THREE.Vector3): number {
  const point = firstFacePoint(placed.derived, placed.index);
  const localStep = direction.clone().applyMatrix3(linearInverse(brushWorld(placed.instance)));
  const from = placed.surface.uv.project(point);
  const to = placed.surface.uv.project(point.clone().add(localStep));
  return Math.hypot(to.u - from.u, to.v - from.v);
}

/**
 * Returns the inverse of a matrix's linear part.
 *
 * @param matrix Brush local-to-world matrix.
 * @returns Inverse linear matrix.
 */
function linearInverse(matrix: THREE.Matrix4): THREE.Matrix3 {
  return new THREE.Matrix3().setFromMatrix4(matrix.clone().invert());
}

/**
 * Returns one vertex of a face.
 *
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Vertex.
 */
export function firstFacePoint(derived: ModifierBevelDerivedBrush, faceIndex: number): THREE.Vector3 {
  const face = derived.localBrush.faces[faceIndex];
  const point = face ? derived.localBrush.getFaceVertices(face)[0] : undefined;
  if (!point) throw new Error('expected a vertex');
  return point;
}

/**
 * Returns the world normal of a derived face.
 *
 * @param placed Resolved strip.
 * @returns Unit world normal.
 */
export function worldFaceNormal(placed: PlacedLayout): THREE.Vector3 {
  const normal = placed.derived.localBrush.planes[placed.index]?.normal ?? new THREE.Vector3(0, 1, 0);
  const world = normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(brushWorld(placed.instance)));
  return world.normalize();
}

/**
 * Returns a unit tangent perpendicular to a normal.
 *
 * @param normal Unit normal.
 * @returns Unit tangent.
 */
export function planeTangent(normal: THREE.Vector3): THREE.Vector3 {
  const guide = Math.abs(normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(normal, guide).normalize();
}

/**
 * Returns the brush mesh.
 *
 * @param instance Authored brush.
 * @returns Mesh.
 */
export function brushMesh(instance: SolidBrushInstance): THREE.Mesh {
  const mesh = instance.mesh;
  if (!mesh) throw new Error('expected a mesh');
  return mesh;
}

/**
 * Returns the brush world matrix.
 *
 * @param instance Authored brush.
 * @returns Local-to-world matrix.
 */
function brushWorld(instance: SolidBrushInstance): THREE.Matrix4 {
  return brushMesh(instance).matrixWorld;
}

/**
 * Derives one brush.
 *
 * @param instance Authored brush.
 * @param volume Bevel volume.
 * @returns Derived brush.
 */
export function derive(instance: SolidBrushInstance, volume: THREE.Object3D): ModifierBevelDerivedBrush {
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived brush');
  return derived;
}

/**
 * Returns the first profile strip.
 *
 * @param derived Derived brush.
 * @returns Face index.
 */
export function stripIndex(derived: ModifierBevelDerivedBrush): number {
  const index = derived.faces.findIndex((face) => face.chamferEdge && !face.cornerFace);
  if (index < 0) throw new Error('expected a strip');
  return index;
}

/**
 * Reads the UV bounds of one face.
 *
 * @param surface Face surface.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Bounds.
 */
export function uvBounds(
  surface: FaceSurfaceDescription,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): { minU: number; maxU: number; minV: number; maxV: number } {
  const bounds = { minU: Number.POSITIVE_INFINITY, maxU: -1, minV: Number.POSITIVE_INFINITY, maxV: -1 };
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  for (const point of points) includeUv(bounds, surface.uv.project(point));
  return bounds;
}

/**
 * Expands bounds by one UV.
 *
 * @param bounds Bounds updated in place.
 * @param uv Projected coordinate.
 */
function includeUv(
  bounds: { minU: number; maxU: number; minV: number; maxV: number },
  uv: { u: number; v: number },
): void {
  bounds.minU = Math.min(bounds.minU, uv.u);
  bounds.maxU = Math.max(bounds.maxU, uv.u);
  bounds.minV = Math.min(bounds.minV, uv.v);
  bounds.maxV = Math.max(bounds.maxV, uv.v);
}

/**
 * Returns the face vertex farthest from its parent plane.
 *
 * @param instance Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Face index.
 * @returns Vertex.
 */
export function farthestVertex(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
): THREE.Vector3 {
  const parent = instance.brush.planes[derived.faces[faceIndex]?.parentSurfaceIndex ?? 0];
  const face = derived.localBrush.faces[faceIndex];
  const points = face ? derived.localBrush.getFaceVertices(face) : [];
  let best = points[0];
  let bestDistance = -1;
  for (const point of points) {
    const distance = parent ? Math.abs(parent.signedDistance(point)) : 0;
    if (!best || distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  if (!best) throw new Error('expected a vertex');
  return best;
}

/**
 * Returns the length of the U row.
 *
 * @param surface Face surface.
 * @returns Length.
 */
export function rowLength(surface: FaceSurfaceDescription): number {
  return Math.hypot(surface.uv.u.x, surface.uv.u.y, surface.uv.u.z);
}

/**
 * Returns whether every generated face uses the volume texture.
 *
 * @param instance Authored instance.
 * @param derived Derived brush.
 * @param textureId Expected texture.
 * @returns True when every generated face matches.
 */
export function generatedUsesTexture(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  textureId: string,
): boolean {
  return derived.faces.every((face, index) => {
    if (!face.chamferEdge) return true;
    return modifierBevelResolveDerivedSurface(instance, derived, index).textureId === textureId;
  });
}

/**
 * Returns whether authored faces keep a texture other than the volume override.
 *
 * @param instance Authored instance.
 * @param derived Derived brush.
 * @param textureId Volume texture.
 * @returns True when an authored face avoids the override.
 */
export function authoredKeepsItsTexture(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  textureId: string,
): boolean {
  return derived.faces.some((face, index) => {
    if (face.chamferEdge) return false;
    return modifierBevelResolveDerivedSurface(instance, derived, index).textureId !== textureId;
  });
}

/**
 * Returns the absolute U span of one trim edge.
 *
 * @param scaleU Meters per tile along U.
 * @returns Absolute U change from one end of the edge to the other.
 */
export function trimAlongSpan(scaleU: number): number {
  const { instance, volume } = boxAndVolume();
  ModifierVolumeBevel.writeUvLayout(volume, MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM);
  const settings = ModifierVolumeBevel.readSettings(volume);
  ModifierVolumeBevel.writeSettings(volume, { ...settings, uvScaleU: scaleU });
  const derived = derive(instance, volume);
  const index = stripIndex(derived);
  const edge = derived.faces[index]?.chamferEdge;
  if (!edge) return 0;
  const uv = modifierBevelResolveDerivedSurface(instance, derived, index).uv;
  return Math.abs(uv.project(edge.pointA).u - uv.project(edge.pointB).u);
}

/**
 * Returns whether the bevel edge carries the parent texture.
 *
 * @param layout Tile or trim.
 * @returns True when both edge points match the parent UV.
 */
export function edgeMeetsParent(layout: ModifierBevelUvLayout): boolean {
  const { instance, derived, index } = derivedLayout(layout);
  const edge = derived.faces[index]?.chamferEdge;
  const parentIndex = derived.faces[index]?.parentSurfaceIndex ?? 0;
  if (!edge) return false;
  const parent = instance.getFaceSurface(parentIndex).uv;
  const bevel = modifierBevelResolveDerivedSurface(instance, derived, index).uv;
  return uvMeetsParent(parent, bevel, edge.pointA) && uvMeetsParent(parent, bevel, edge.pointB);
}

/**
 * Returns whether one point uses the parent UV, possibly with axes swapped.
 *
 * @param parent Parent UV matrix.
 * @param bevel Bevel UV matrix.
 * @param point Local point.
 * @returns True when the coordinates agree.
 */
function uvMeetsParent(parent: SurfaceUvMatrix, bevel: SurfaceUvMatrix, point: THREE.Vector3): boolean {
  const wall = parent.project(point);
  const cut = bevel.project(point);
  const direct = Math.abs(cut.u - wall.u) < 1e-3 && Math.abs(cut.v - wall.v) < 1e-3;
  const swapped = Math.abs(cut.u - wall.v) < 1e-3 && Math.abs(cut.v - wall.u) < 1e-3;
  return direct || swapped;
}

/**
 * Returns whether a view projection copies two local axes.
 *
 * @param layout Overhead, front, or side.
 * @param uAxis Local axis copied into U.
 * @param vAxis Local axis copied into V.
 * @returns True when an unrotated face point matches.
 */
export function viewMatches(layout: ModifierBevelUvLayout, uAxis: 'x' | 'y' | 'z', vAxis: 'x' | 'y' | 'z'): boolean {
  const { instance, derived, index } = derivedLayout(layout);
  const surface = modifierBevelResolveDerivedSurface(instance, derived, index);
  const point = firstFacePoint(derived, index);
  const uv = surface.uv.project(point);
  return Math.abs(uv.u - point[uAxis]) < 1e-4 && Math.abs(uv.v - point[vAxis]) < 1e-4;
}

/**
 * Derives one layout with several profile segments.
 *
 * @param layout UV layout.
 * @param segments Profile segment count.
 * @returns Resolved strip.
 */
export function layoutSegments(layout: ModifierBevelUvLayout, segments: number): PlacedLayout {
  const { instance, volume } = boxAndVolume();
  ModifierVolumeBevel.writeSegments(volume, segments);
  ModifierVolumeBevel.writeUvLayout(volume, layout);
  const derived = derive(instance, volume);
  const index = stripIndex(derived);
  return { instance, derived, index, surface: modifierBevelResolveDerivedSurface(instance, derived, index) };
}

/**
 * Returns whether one layout's segments share a growing curve.
 *
 * @param layout Tile or cubic.
 * @returns True when the curve is wider than one segment and the seams agree.
 */
export function curveSpreads(layout: ModifierBevelUvLayout): boolean {
  const placed = layoutSegments(layout, 4);
  const chain = modifierBevelProfileChain(placed.derived, placed.index);
  const span = chainSpanV(placed, chain);
  const face = uvBounds(placed.surface, placed.derived, placed.index);
  return chain.length > 1 && span > (face.maxV - face.minV) * 1.5 && seamsAgree(placed, chain);
}

/**
 * Returns whether trim uses one copy for every segment of the curve.
 *
 * @returns True when the curve spans one texture and one segment does not.
 */
export function trimCoversCurveOnce(): boolean {
  const placed = layoutSegments(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_TRIM, 4);
  const chain = modifierBevelProfileChain(placed.derived, placed.index);
  const span = chainSpanV(placed, chain);
  const face = uvBounds(placed.surface, placed.derived, placed.index);
  return chain.length > 1 && span > 0.99 && span < 1.01 && face.maxV - face.minV < 0.5 && seamsAgree(placed, chain);
}

/**
 * Returns whether stretch uses one copy for every segment of the curve.
 *
 * @returns True when the curve spans one texture and one segment does not.
 */
export function stretchCoversCurveOnce(): boolean {
  const placed = layoutSegments(MODIFIER_VOLUME_BEVEL_UV_LAYOUT_STRETCH, 4);
  const chain = modifierBevelProfileChain(placed.derived, placed.index);
  const bounds = chainBoundsV(placed, chain);
  const face = uvBounds(placed.surface, placed.derived, placed.index);
  return stretchCurveFits(chain.length, bounds, face) && seamsAgree(placed, chain);
}

/**
 * Returns whether stretch bounds cover the curve once.
 *
 * @param count Faces in the curve.
 * @param bounds V bounds of the whole curve.
 * @param face V bounds of the first face.
 * @returns True when the curve is one copy and the face is only part of it.
 */
function stretchCurveFits(
  count: number,
  bounds: { minV: number; maxV: number },
  face: { minV: number; maxV: number },
): boolean {
  const span = bounds.maxV - bounds.minV;
  if (count < 2 || span < 0.99 || span > 1.01) return false;
  return bounds.minV > -1e-3 && bounds.maxV < 1.01 && face.maxV - face.minV < 0.5;
}

/**
 * Returns the V span of every face in a curve.
 *
 * @param placed Resolved strip.
 * @param chain Curve face indices.
 * @returns Highest V minus lowest V.
 */
export function chainSpanV(placed: PlacedLayout, chain: readonly number[]): number {
  const bounds = chainBoundsV(placed, chain);
  return bounds.maxV - bounds.minV;
}

/**
 * Returns the V bounds of every face in a curve.
 *
 * @param placed Resolved strip.
 * @param chain Curve face indices.
 * @returns Lowest and highest V.
 */
function chainBoundsV(placed: PlacedLayout, chain: readonly number[]): { minV: number; maxV: number } {
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const index of chain)
    includeChainV(placed, index, (bounds) => {
      minV = Math.min(minV, bounds.minV);
      maxV = Math.max(maxV, bounds.maxV);
    });
  return { minV, maxV };
}

/**
 * Reads one face's V bounds.
 *
 * @param placed Resolved strip.
 * @param faceIndex Face index.
 * @param visit Called with that face's bounds.
 */
function includeChainV(
  placed: PlacedLayout,
  faceIndex: number,
  visit: (bounds: { minV: number; maxV: number }) => void,
): void {
  const surface = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, faceIndex);
  visit(uvBounds(surface, placed.derived, faceIndex));
}

/**
 * Returns whether neighboring segments share UV on their common edge.
 *
 * @param placed Resolved strip.
 * @param chain Curve face indices.
 * @returns True when every shared edge agrees.
 */
export function seamsAgree(placed: PlacedLayout, chain: readonly number[]): boolean {
  for (let index = 1; index < chain.length; index += 1) {
    const previous = chain[index - 1];
    const current = chain[index];
    if (previous === undefined || current === undefined) return false;
    if (!segmentSeamAgrees(placed, previous, current)) return false;
  }
  return chain.length > 1;
}

/**
 * Returns whether two segments agree on the later segment's edge.
 *
 * @param placed Resolved strip.
 * @param previous Earlier face.
 * @param current Later face.
 * @returns True when both endpoints agree.
 */
function segmentSeamAgrees(placed: PlacedLayout, previous: number, current: number): boolean {
  const edge = modifierBevelSharedEdge(placed.derived.localBrush, previous, current);
  if (!edge) return false;
  const start = edgePointAgrees(placed, previous, current, edge.pointA);
  return start && edgePointAgrees(placed, previous, current, edge.pointB);
}

/**
 * Returns whether two faces give one point the same UV.
 *
 * @param placed Resolved strip.
 * @param previous Earlier face.
 * @param current Later face.
 * @param point Local point.
 * @returns True when U and V agree.
 */
export function edgePointAgrees(
  placed: PlacedLayout,
  previous: number,
  current: number,
  point: THREE.Vector3,
): boolean {
  const before = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, previous).uv.project(point);
  const after = modifierBevelResolveDerivedSurface(placed.instance, placed.derived, current).uv.project(point);
  return Math.abs(before.u - after.u) < 1e-3 && Math.abs(before.v - after.v) < 1e-3;
}
