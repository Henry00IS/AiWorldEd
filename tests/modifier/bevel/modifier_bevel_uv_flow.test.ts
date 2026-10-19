import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelProfileStrip } from '@/modifier/bevel/modifier_bevel_uv_layout_profile.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { modifierBevelDerivedFromCache } from '@/modifier/compile/modifier_bevel_derived_cache.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY,
  MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  MODIFIER_VOLUME_BEVEL_UV_LARGEST,
  MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
  MODIFIER_VOLUME_BEVEL_UV_NEAREST,
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  MODIFIER_VOLUME_BEVEL_UV_REVERSE,
  MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
  type ModifierBevelUvFlow,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';

describe('bevel uv flow', () => {
  it('reads a missing flow as winding', () => {
    const volume = ModifierVolumeBevel.create();
    delete volume.userData[MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY];
    expect(ModifierVolumeBevel.readUvFlow(volume)).toBe(MODIFIER_VOLUME_BEVEL_UV_WINDING);
  });

  it('keeps winding parents and continues the smear', () => {
    const instance = boxInstance(1, 'brush-uv-winding');
    const winding = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_WINDING)]);
    const implicit = deriveOn(instance, [coveredVolumeWithoutFlow()]);
    expect(parentList(winding)).toEqual(parentList(implicit));
    expect(smearHolds(instance, winding)).toBe(true);
  });

  it('gives the upward corner to the world-up face', () => {
    const instance = boxInstance(1, 'brush-uv-up');
    turnBrushOntoItsSide(instance);
    const winding = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_WINDING)]);
    const upwardVolume = covered(MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    ModifierVolumeBevel.writeSettings(upwardVolume, {
      ...ModifierVolumeBevel.readSettings(upwardVolume),
      uvSpace: MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
    });
    const upward = deriveOn(instance, [upwardVolume]);
    const worldUp = faceMostAligned(instance, new THREE.Vector3(0, 1, 0));
    const upNormal = instance.brush.planes[worldUp]?.normal ?? new THREE.Vector3(0, 1, 0);
    expect(cornerParent(upward, upNormal)).toBe(worldUp);
    expect(parentList(upward)).not.toEqual(parentList(winding));
  });

  it('prefers a large face, and smallest prefers the small end', () => {
    const instance = boxInstance(4, 'brush-uv-area');
    const largest = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_LARGEST)]);
    const smallest = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_SMALLEST)]);
    expect(parentList(largest)).not.toEqual(parentList(smallest));
    expect(stripUsesArea(instance, largest, 4)).toBe(true);
    expect(stripUsesArea(instance, smallest, 1)).toBe(true);
  });

  it('reverses a strip parent away from winding order', () => {
    const instance = boxInstance(1, 'brush-uv-reverse');
    const winding = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_WINDING)]);
    const reversed = deriveOn(instance, [covered(MODIFIER_VOLUME_BEVEL_UV_REVERSE)]);
    expect(parentsDiffer(winding, reversed)).toBe(true);
  });

  it('uses the volume nearest the top of the outliner when flows disagree', () => {
    const instance = boxInstance(1, 'brush-uv-mixed');
    const root = new THREE.Group();
    const top = covered(MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    const lower = covered(MODIFIER_VOLUME_BEVEL_UV_LARGEST);
    root.add(top);
    root.add(lower);
    const mixed = deriveOn(instance, [lower, top]);
    const upward = deriveOn(instance, [top]);
    expect(parentList(mixed)).toEqual(parentList(upward));
  });

  it('splits a nearest strip between the two walls it joins', () => {
    const instance = boxInstance(1, 'brush-uv-nearest-strip');
    const derived = deriveOn(instance, [segmented(MODIFIER_VOLUME_BEVEL_UV_NEAREST, 4)]);
    expect(openEdgeParents(derived).size).toBeGreaterThan(1);
  });

  it('keeps one parent on every bevel corner', () => {
    const instance = boxInstance(1, 'brush-uv-corner-parent');
    for (const flow of cornerParentFlows()) {
      const derived = deriveOn(instance, [segmented(flow, 4)]);
      expect(
        cornerParentSizes(derived).every((size) => size >= 2),
        flow,
      ).toBe(true);
    }
  });

  it('rebuilds the cached chamfer when the flow changes', () => {
    const instance = boxInstance(1, 'brush-uv-cache');
    const volume = covered(MODIFIER_VOLUME_BEVEL_UV_WINDING);
    const first = modifierBevelDerivedFromCache(instance, [volume]);
    ModifierVolumeBevel.writeUvFlow(volume, MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    const second = modifierBevelDerivedFromCache(instance, [volume]);
    expect(first?.rebuilt).toBe(true);
    expect(second?.rebuilt).toBe(true);
    expect(second?.derived).not.toBe(first?.derived);
  });
});

/**
 * Derives one brush against the given volumes.
 *
 * @param instance Authored brush.
 * @param volumes Bevel volumes.
 * @returns Derived brush.
 */
function deriveOn(instance: SolidBrushInstance, volumes: THREE.Object3D[]): ModifierBevelDerivedBrush {
  const derived = modifierBevelDeriveBrush(instance, volumes);
  if (!derived) throw new Error('expected a derived brush');
  return derived;
}

/**
 * Builds a box instance centered at the origin.
 *
 * @param width Size along X.
 * @param id Cache identity.
 * @returns Instance with an identity mesh.
 */
function boxInstance(width: number, id: string): SolidBrushInstance {
  const instance = new SolidBrushInstance(id, 'Box', SolidBrushFactory.createCenteredBox(width, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Builds a chamfer volume that covers the brush.
 *
 * @param flow UV flow.
 * @returns Bevel volume.
 */
function segmented(flow: ModifierBevelUvFlow, segments: number): THREE.Mesh {
  const volume = covered(flow);
  ModifierVolumeBevel.writeSegments(volume, segments);
  return volume;
}

/**
 * Lists parents of the strips on the edge between world +Y and +Z.
 *
 * @param derived Derived brush.
 * @returns Parent indices.
 */
function openEdgeParents(derived: ModifierBevelDerivedBrush): Set<number> {
  const parents = new Set<number>();
  derived.localBrush.planes.forEach((plane, index) => {
    const normal = plane?.normal;
    const record = derived.faces[index];
    if (!normal || !record?.chamferEdge || record.cornerFace) return;
    if (Math.abs(normal.x) > 0.2 || normal.y <= 0.2 || normal.z <= 0.2) return;
    parents.add(record.parentSurfaceIndex);
  });
  return parents;
}

/**
 * Lists the flows that must keep a whole corner on one wall.
 *
 * @returns UV flows.
 */
function cornerParentFlows(): readonly ModifierBevelUvFlow[] {
  return [
    MODIFIER_VOLUME_BEVEL_UV_WINDING,
    MODIFIER_VOLUME_BEVEL_UV_REVERSE,
    MODIFIER_VOLUME_BEVEL_UV_LARGEST,
    MODIFIER_VOLUME_BEVEL_UV_SMALLEST,
    MODIFIER_VOLUME_BEVEL_UV_MAJORITY,
    MODIFIER_VOLUME_BEVEL_UV_NEAREST,
    MODIFIER_VOLUME_BEVEL_UV_ALIGNED,
  ];
}

/**
 * Counts parents inside each three-axis corner.
 *
 * @param derived Derived brush.
 * @returns One count per corner that has faces.
 */
function cornerParentSizes(derived: ModifierBevelDerivedBrush): number[] {
  const groups = new Map<string, Set<number>>();
  derived.localBrush.planes.forEach((plane, index) => {
    collectCornerParent(derived, plane?.normal, index, groups);
  });
  return [...groups.values()].map((parents) => parents.size);
}

/**
 * Adds one face when it sits in a three-axis corner.
 *
 * @param derived Derived brush.
 * @param normal Face normal.
 * @param index Face index.
 * @param groups Corner parent sets.
 */
function collectCornerParent(
  derived: ModifierBevelDerivedBrush,
  normal: THREE.Vector3 | undefined,
  index: number,
  groups: Map<string, Set<number>>,
): void {
  if (!normal || !cornerIsOpen(normal)) return;
  const record = derived.faces[index];
  if (!record?.chamferEdge) return;
  const key = `${Math.sign(normal.x)}:${Math.sign(normal.y)}:${Math.sign(normal.z)}`;
  const parents = groups.get(key) ?? new Set<number>();
  parents.add(record.parentSurfaceIndex);
  groups.set(key, parents);
}

/**
 * Returns whether a normal points between three axes.
 *
 * @param normal Face normal.
 * @returns True when every axis still has a share.
 */
function cornerIsOpen(normal: THREE.Vector3): boolean {
  const axes = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)].sort((left, right) => left - right);
  return (axes[0] ?? 0) > 0.25;
}

/**
 * Builds a bevel volume that covers the brush.
 *
 * @param flow UV flow.
 * @returns Bevel volume.
 */
function covered(flow: ModifierBevelUvFlow): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  ModifierVolumeBevel.writeUvFlow(volume, flow);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Builds a covering volume that leaves the flow unset.
 *
 * @returns Bevel volume.
 */
function coveredVolumeWithoutFlow(): THREE.Mesh {
  const volume = covered(MODIFIER_VOLUME_BEVEL_UV_WINDING);
  delete volume.userData[MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY];
  return volume;
}

/**
 * Lists authored parents in derived face order.
 *
 * @param derived Derived brush.
 * @returns Parent indices.
 */
function parentList(derived: ModifierBevelDerivedBrush): number[] {
  return derived.faces.map((face) => face.parentSurfaceIndex);
}

/**
 * Returns whether any parent differs.
 *
 * @param left First derived brush.
 * @param right Second derived brush.
 * @returns True when a parent index differs.
 */
function parentsDiffer(left: ModifierBevelDerivedBrush, right: ModifierBevelDerivedBrush): boolean {
  return parentList(left).some((parent, index) => parent !== parentList(right)[index]);
}

/**
 * Returns the parent of the generated face most aligned with a direction.
 *
 * @param derived Derived brush.
 * @param direction Desired face direction.
 * @returns Authored parent index.
 */
function cornerParent(derived: ModifierBevelDerivedBrush, direction: THREE.Vector3): number {
  let bestParent = 0;
  let bestDot = -2;
  derived.localBrush.planes.forEach((plane, index) => {
    const record = derived.faces[index];
    if (!plane || !record?.chamferEdge) return;
    const dot = plane.normal.dot(direction.clone().normalize());
    if (dot <= bestDot) return;
    bestDot = dot;
    bestParent = record.parentSurfaceIndex;
  });
  return bestParent;
}

/**
 * Rolls the brush so its local +X face points world up.
 *
 * @param instance Brush instance.
 */
function turnBrushOntoItsSide(instance: SolidBrushInstance): void {
  const mesh = instance.mesh;
  if (!mesh) return;
  mesh.rotation.z = Math.PI / 2;
  mesh.updateMatrixWorld(true);
}

/**
 * Returns the authored face whose world normal best matches a direction.
 *
 * @param instance Brush instance.
 * @param direction World direction.
 * @returns Face index.
 */
function faceMostAligned(instance: SolidBrushInstance, direction: THREE.Vector3): number {
  const mesh = instance.mesh;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh ? mesh.matrixWorld : new THREE.Matrix4());
  let best = 0;
  let bestDot = -2;
  instance.brush.planes.forEach((plane, index) => {
    if (!plane) return;
    const dot = plane.normal.clone().applyMatrix3(normalMatrix).dot(direction);
    if (dot <= bestDot) return;
    bestDot = dot;
    best = index;
  });
  return best;
}

/**
 * Returns whether a profile strip inherits a face of the given area.
 *
 * @param instance Authored brush.
 * @param derived Derived brush.
 * @param area Expected parent area.
 * @returns True when a strip uses that parent.
 */
function stripUsesArea(instance: SolidBrushInstance, derived: ModifierBevelDerivedBrush, area: number): boolean {
  return derived.faces.some((record, index) => {
    if (!modifierBevelProfileStrip(derived, index)) return false;
    return Math.abs(faceArea(instance.brush, record.parentSurfaceIndex) - area) < 1e-3;
  });
}

/**
 * Returns the local area of an authored face.
 *
 * @param brush Authored brush.
 * @param faceIndex Face index.
 * @returns Area.
 */
function faceArea(brush: SolidBrush, faceIndex: number): number {
  const face = brush.faces[faceIndex];
  const origin = face ? brush.getFaceVertices(face)[0] : undefined;
  if (!face || !origin) return 0;
  return polygonArea(brush.getFaceVertices(face), origin);
}

/**
 * Returns the area of a polygon fan.
 *
 * @param points Polygon vertices.
 * @param origin Fan origin.
 * @returns Area.
 */
function polygonArea(points: readonly THREE.Vector3[], origin: THREE.Vector3): number {
  const sum = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let index = 1; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (!left || !right) continue;
    sum.add(cross.crossVectors(left.clone().sub(origin), right.clone().sub(origin)));
  }
  return sum.length() * 0.5;
}

/**
 * Returns whether every smear keeps the source UV on the shared edge.
 *
 * @param instance Authored instance.
 * @param derived Derived brush.
 * @returns True when every smear continues.
 */
function smearHolds(instance: SolidBrushInstance, derived: ModifierBevelDerivedBrush): boolean {
  const memo = new Map<number, ReturnType<SolidBrushInstance['getFaceSurface']>>();
  for (let index = 0; index < derived.faces.length; index += 1) {
    if (!smearFaceHolds(instance, derived, index, memo)) return false;
  }
  return true;
}

/**
 * Returns whether one smear face matches its source at both edge points.
 *
 * @param instance Authored instance.
 * @param derived Derived brush.
 * @param faceIndex Derived face.
 * @param memo Resolved surfaces.
 * @returns True when the face has no smear or the smear matches.
 */
function smearFaceHolds(
  instance: SolidBrushInstance,
  derived: ModifierBevelDerivedBrush,
  faceIndex: number,
  memo: Map<number, ReturnType<SolidBrushInstance['getFaceSurface']>>,
): boolean {
  const record = derived.faces[faceIndex];
  if (record?.cornerFace) return true;
  if (!record?.chamferEdge || record.smearFromDerivedIndex < 0) return !record?.chamferEdge;
  const surface = modifierBevelResolveDerivedSurface(instance, derived, faceIndex, memo);
  const from = modifierBevelResolveDerivedSurface(instance, derived, record.smearFromDerivedIndex, memo);
  const edge = record.chamferEdge;
  return Math.abs(surface.uv.project(edge.pointA).u - from.uv.project(edge.pointA).u) < 1e-3;
}
