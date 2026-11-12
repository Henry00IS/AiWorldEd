import { Matrix3, Vector3, Vector4 } from 'three';
import { expect } from 'vitest';
import { boxAndVolume, derive } from './modifier_bevel_uv_layout_fixture.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import type { ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelNeighborFaces, modifierBevelSharedEdge } from '@/modifier/bevel/modifier_bevel_face_graph.js';
import {
  modifierBevelReadUvPlacement,
  modifierBevelWriteUvPlacement,
} from '@/modifier/volume/modifier_volume_bevel_uv_placement.js';
import type {
  ModifierBevelUvLayout,
  ModifierBevelUvOwner,
  ModifierBevelUvFlow,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Projection layouts exercised against every geometry in the segment matrix. */
export const segmentLayouts: ModifierBevelUvLayout[] = [
  'continue',
  'tile',
  'trim',
  'stretch',
  'project',
  'cubic',
  'overhead',
  'front',
  'side',
  'axis',
];

/** Geometry, parent surfaces, and the derived bevel used for a matrix cell. */
export interface SegmentFixture {
  /** Authored textured brush. */
  instance: SolidBrushInstance;
  /** Derived geometry and volume settings. */
  derived: ModifierBevelDerivedBrush;
}

/**
 * Creates an isolated edge, partially covered box, or fully rounded box.
 *
 * @param segments Requested profile segments.
 * @param distance World bevel distance.
 * @param coverage Volume coverage: edge, partial, or whole.
 * @param owner Single or split ownership.
 * @param posed Whether to rotate and nonuniformly scale the brush.
 * @param flow Parent-face preference.
 * @param angle Sharpness threshold in degrees.
 * @returns Derived test geometry.
 */
export function segmentFixture(
  segments: number,
  distance: number,
  coverage: string,
  owner: ModifierBevelUvOwner,
  posed: boolean,
  flow: ModifierBevelUvFlow = 'winding',
  angle = 30,
): SegmentFixture {
  const { instance, volume } = boxAndVolume();
  instance.setAllFacesTextureId('random-photo');
  if (posed && instance.mesh) {
    instance.mesh.rotation.set(0.2, -0.3, 0.4);
    instance.mesh.scale.set(1.3, 0.8, 1.6);
    instance.mesh.updateMatrixWorld(true);
  }
  if (coverage !== 'whole') {
    volume.position.set(0.5, 0.5, 0);
    volume.scale.set(0.4, 0.4, coverage === 'edge' ? 0.4 : 3);
    volume.updateMatrixWorld(true);
  }
  ModifierVolumeBevel.writeSegments(volume, segments);
  ModifierVolumeBevel.writeDistance(volume, distance);
  ModifierVolumeBevel.writeUvFlow(volume, flow);
  ModifierVolumeBevel.writeAngleDegrees(volume, angle);
  modifierBevelWriteUvPlacement(volume, { ...modifierBevelReadUvPlacement(volume), uvOwner: owner });
  return { instance, derived: derive(instance, volume) };
}

/**
 * Checks texture assignment, finite coordinates, density, and chart seams.
 *
 * @param fixture Derived geometry and source surfaces.
 * @param layout Projection layout.
 * @param texture Empty inherits; otherwise overrides generated faces.
 */
export function verifySegmentLayout(fixture: SegmentFixture, layout: ModifierBevelUvLayout, texture: string): void {
  fixture.derived.layout = layout;
  fixture.derived.textureId = texture;
  const matrices = fixture.derived.faces.map((record, index) => {
    const surface = modifierBevelResolveDerivedSurface(fixture.instance, fixture.derived, index);
    expect(surface.textureId).toBe(record.chamferEdge ? texture || 'random-photo' : 'random-photo');
    verifySegmentMatrix(fixture, index, surface.uv);
    return surface.uv;
  });
  verifySegmentSeams(fixture, matrices);
}

/**
 * Checks coordinates and the active projection's measurable invariants.
 *
 * @param fixture Derived geometry.
 * @param index Face index.
 * @param uv Resolved UV matrix.
 */
function verifySegmentMatrix(fixture: SegmentFixture, index: number, uv: SurfaceUvMatrix): void {
  const { derived, instance } = fixture;
  expect([...uv.u.toArray(), ...uv.v.toArray()].every(Number.isFinite)).toBe(true);
  if (!derived.faces[index]?.chamferEdge) return;
  const layout = derived.layout;
  if (layout === 'continue' || layout === 'cubic') verifyUnitDensity(fixture, index, uv);
  if (layout === 'tile' || layout === 'trim' || layout === 'stretch') verifyProfileDensity(fixture, index, uv);
  if (['overhead', 'front', 'side', 'axis'].includes(layout)) verifyViewProjection(fixture, index, uv);
  if (layout === 'project') {
    const parent = instance.getFaceSurface(derived.faces[index]?.parentSurfaceIndex ?? 0).uv;
    expect(uv.u.toArray()).toEqual(parent.u.toArray());
    expect(uv.v.toArray()).toEqual(parent.v.toArray());
  }
}

/**
 * Checks world-unit density for an unfolded orthonormal parent or cubic grid.
 *
 * @param fixture Derived geometry.
 * @param index Face index.
 * @param uv UV matrix.
 */
function verifyUnitDensity(fixture: SegmentFixture, index: number, uv: SurfaceUvMatrix): void {
  if (fixture.derived.layout === 'continue' && !fixture.instance.mesh?.scale.equals(new Vector3(1, 1, 1))) return;
  const u = worldGradient(fixture, index, uv.u);
  const v = worldGradient(fixture, index, uv.v);
  expect(
    u.length(),
    JSON.stringify({ layout: fixture.derived.layout, index, record: fixture.derived.faces[index] }),
  ).toBeCloseTo(1, 5);
  expect(v.length()).toBeCloseTo(1, 5);
  expect(u.dot(v)).toBeCloseTo(0, 5);
}

/**
 * Checks a profile's arc-based density without assuming a fixed segment size.
 *
 * @param fixture Derived geometry.
 * @param index Face index.
 * @param uv UV matrix.
 */
function verifyProfileDensity(fixture: SegmentFixture, index: number, uv: SurfaceUvMatrix): void {
  const { derived } = fixture;
  const girder = derived.girders[derived.girderOfFace[index] ?? -1];
  if (!girder) throw new Error('Expected a profile girder');
  const lengthRate = derived.layout === 'stretch' ? 1 / girder.edgeMeters : 1;
  const profileScale = derived.layout === 'tile' ? 1 : girder.profileMeters;
  expect(worldGradient(fixture, index, uv.u).length()).toBeCloseTo(lengthRate, 4);
  const rate = worldGradient(fixture, index, uv.v).length() * profileScale;
  expect(rate).toBeGreaterThan(0.99);
  expect(rate).toBeLessThan(1.12);
}

/**
 * Transforms a UV row to a world gradient tangent to its face.
 *
 * @param fixture Derived geometry.
 * @param index Face index.
 * @param row UV row.
 * @returns World tangent gradient.
 */
function worldGradient(fixture: SegmentFixture, index: number, row: Vector4): Vector3 {
  const matrix = fixture.instance.mesh?.matrixWorld;
  if (!matrix) throw new Error('Expected a brush mesh');
  const transform = new Matrix3().getNormalMatrix(matrix);
  const normal = fixture.derived.localBrush.planes[index]?.normal.clone().applyMatrix3(transform).normalize();
  if (!normal) throw new Error('Expected a face normal');
  const axis = new Vector3(row.x, row.y, row.z).applyMatrix3(transform);
  return axis.addScaledVector(normal, -axis.dot(normal));
}

/**
 * Checks chart continuity between segments assigned to the same authored edge.
 *
 * @param fixture Derived geometry.
 * @param matrices UV matrices for all faces.
 */
function verifySegmentSeams(fixture: SegmentFixture, matrices: SurfaceUvMatrix[]): void {
  const { derived } = fixture;
  if (!['tile', 'trim', 'stretch'].includes(derived.layout)) return;
  for (let index = 0; index < derived.faces.length; index += 1) {
    if (!derived.faces[index]?.chamferEdge) continue;
    for (const neighbor of modifierBevelNeighborFaces(derived.localBrush, index)) {
      if (neighbor <= index || !derived.faces[neighbor]?.chamferEdge) continue;
      if (derived.girderOfFace[index] !== derived.girderOfFace[neighbor]) continue;
      verifySegmentSeam(derived, index, neighbor, matrices);
    }
  }
}

/**
 * Checks both endpoints of a shared profile edge.
 *
 * @param derived Derived brush.
 * @param left First segment.
 * @param right Adjacent segment.
 * @param matrices Face UV matrices.
 */
function verifySegmentSeam(
  derived: ModifierBevelDerivedBrush,
  left: number,
  right: number,
  matrices: SurfaceUvMatrix[],
): void {
  const edge = modifierBevelSharedEdge(derived.localBrush, left, right);
  if (!edge) throw new Error('Expected a shared edge');
  for (const point of [edge.pointA, edge.pointB]) {
    const a = matrices[left]?.project(point);
    const b = matrices[right]?.project(point);
    expect(a?.u).toBeCloseTo(b?.u ?? Infinity, 4);
    expect(a?.v).toBeCloseTo(b?.v ?? Infinity, 4);
  }
}

/**
 * Checks every projected vertex against independent world or brush axes.
 *
 * @param fixture Derived geometry.
 * @param index Face index.
 * @param uv UV matrix.
 */
function verifyViewProjection(fixture: SegmentFixture, index: number, uv: SurfaceUvMatrix): void {
  const { derived, instance } = fixture;
  const world = instance.mesh?.matrixWorld;
  const loop = derived.localBrush.faces[index];
  if (!world || !loop) throw new Error('Expected a face and world transform');
  const local = derived.placement.uvSpace === 'local';
  const normal = derived.localBrush.planes[index]?.normal.clone() ?? new Vector3();
  if (!local) normal.applyMatrix3(new Matrix3().getNormalMatrix(world)).normalize();
  const layout = derived.layout === 'axis' ? dominantView(normal) : derived.layout;
  for (const point of derived.localBrush.getFaceVertices(loop)) {
    const sample = local
      ? point.clone().multiply(instance.mesh?.scale ?? new Vector3(1, 1, 1))
      : point.clone().applyMatrix4(world);
    const projected = uv.project(point);
    expect(projected.u).toBeCloseTo(layout === 'side' ? sample.z : sample.x, 5);
    expect(projected.v).toBeCloseTo(layout === 'overhead' ? sample.z : sample.y, 5);
  }
}

/**
 * Selects the fixed-axis view closest to a unit normal.
 *
 * @param normal Face normal in projection space.
 * @returns View layout.
 */
function dominantView(normal: Vector3): string {
  if (Math.abs(normal.y) >= Math.abs(normal.x) && Math.abs(normal.y) >= Math.abs(normal.z)) return 'overhead';
  return Math.abs(normal.z) >= Math.abs(normal.x) ? 'front' : 'side';
}
