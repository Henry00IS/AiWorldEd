import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelDeriveBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { modifierBevelResolveDerivedSurface } from '@/modifier/bevel/modifier_bevel_stand_in.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelCompileListBuild } from '@/modifier/compile/modifier_bevel_compile_list.js';
import { MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE } from '@/modifier/volume/modifier_volume_bevel_keys.js';

describe('modifier bevel volume', () => {
  it('returns the authored brush list when no bevel volume is parented', () => {
    const instance = brushInstanceAtOrigin();
    const instances = [instance];
    const result = modifierBevelCompileListBuild(instances, 'scope-empty');
    expect(result.instances).toBe(instances);
    expect(result.extraDirtyBrushIds).toEqual([]);
  });

  it('chamfers an edge inside the volume and leaves the authored brush unchanged', () => {
    const instance = brushInstanceAtOrigin();
    const before = instance.brush.vertices.map((vertex) => vertex.clone());
    const volume = volumeOverTopFrontEdge();
    const derived = modifierBevelDeriveBrush(instance, [volume]);
    expect(derived).not.toBeNull();
    expect(derived!.localBrush.vertices.length).toBeGreaterThan(before.length);
    expect(before.every((vertex, index) => vertex.distanceTo(instance.brush.vertices[index]!) < 1e-8)).toBe(true);
    expect(hasVertexNear(derived!.localBrush.vertices, new THREE.Vector3(0.5, 0.5, 0.45))).toBe(true);
    expect(hasVertexNear(derived!.localBrush.vertices, new THREE.Vector3(0.5, 0.45, 0.5))).toBe(true);
    expect(MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE).toBeCloseTo(0.05, 6);
  });

  it('continues the source face UV across the chamfer edge', () => {
    const instance = brushInstanceAtOrigin();
    const volume = volumeOverTopFrontEdge();
    const derived = modifierBevelDeriveBrush(instance, [volume]);
    expect(derived).not.toBeNull();
    const chamferIndex = derived!.faces.findIndex((face) => face.chamferEdge !== null);
    expect(chamferIndex).toBeGreaterThanOrEqual(0);
    const record = derived!.faces[chamferIndex]!;
    const source = instance.getFaceSurface(record.parentSurfaceIndex);
    const smeared = modifierBevelResolveDerivedSurface(instance, derived!, chamferIndex);
    const edge = record.chamferEdge!;
    const sourceA = source.uv.project(edge.pointA);
    const sourceB = source.uv.project(edge.pointB);
    const smearA = smeared.uv.project(edge.pointA);
    const smearB = smeared.uv.project(edge.pointB);
    expect(smearA.u).toBeCloseTo(sourceA.u, 4);
    expect(smearA.v).toBeCloseTo(sourceA.v, 4);
    expect(smearB.u).toBeCloseTo(sourceB.u, 4);
    expect(smearB.v).toBeCloseTo(sourceB.v, 4);
    expect(smeared.textureId).toBe(source.textureId);
  });

  it('skips an edge that is not sharper than the angle limit', () => {
    const instance = brushInstanceAtOrigin();
    const volume = volumeOverTopFrontEdge();
    ModifierVolumeBevel.writeAngleDegrees(volume, 120);
    expect(modifierBevelDeriveBrush(instance, [volume])).toBeNull();
  });

  it('inserts a rounder profile when the segment count is raised', () => {
    const instance = brushInstanceAtOrigin();
    const flatVolume = volumeOverTopFrontEdge();
    const roundVolume = volumeOverTopFrontEdge();
    ModifierVolumeBevel.writeSegments(roundVolume, 4);
    const flat = modifierBevelDeriveBrush(instance, [flatVolume]);
    const round = modifierBevelDeriveBrush(instance, [roundVolume]);
    expect(flat).not.toBeNull();
    expect(round).not.toBeNull();
    expect(round!.localBrush.vertices.length).toBeGreaterThan(flat!.localBrush.vertices.length);
    expect(hasVertexNear(round!.localBrush.vertices, new THREE.Vector3(0.5, 0.485, 0.485))).toBe(true);
    expect(roundProfileUvContinues(instance, round!)).toBe(true);
  });
});

/**
 * Returns whether each round segment continues UV across its long shared edge.
 *
 * @param instance Authored brush.
 * @param derived Chamfered brush.
 * @returns True when every segment matches its source at both edge points and
 *   steps onward in UV.
 */
function roundProfileUvContinues(
  instance: SolidBrushInstance,
  derived: NonNullable<ReturnType<typeof modifierBevelDeriveBrush>>,
): boolean {
  const memo = new Map<number, ReturnType<SolidBrushInstance['getFaceSurface']>>();
  return derived.faces.every((record, faceIndex) => {
    if (!record.chamferEdge || record.smearFromDerivedIndex < 0) return true;
    const surface = modifierBevelResolveDerivedSurface(instance, derived, faceIndex, memo);
    const from = modifierBevelResolveDerivedSurface(instance, derived, record.smearFromDerivedIndex, memo);
    const edge = record.chamferEdge;
    const sameA = Math.abs(surface.uv.project(edge.pointA).u - from.uv.project(edge.pointA).u) < 1e-3;
    const sameB = Math.abs(surface.uv.project(edge.pointB).v - from.uv.project(edge.pointB).v) < 1e-3;
    const sameAU = Math.abs(surface.uv.project(edge.pointA).v - from.uv.project(edge.pointA).v) < 1e-3;
    const sameBU = Math.abs(surface.uv.project(edge.pointB).u - from.uv.project(edge.pointB).u) < 1e-3;
    return sameA && sameB && sameAU && sameBU && uvStepsAcrossEdge(from, surface, record);
  });
}

/**
 * Returns whether a step into the new face moves UV opposite a step back into
 * the source.
 *
 * @param from Source surface.
 * @param surface Destination surface.
 * @param record Face record with the shared edge.
 * @returns True when the texture continues.
 */
function uvStepsAcrossEdge(
  from: ReturnType<SolidBrushInstance['getFaceSurface']>,
  surface: ReturnType<SolidBrushInstance['getFaceSurface']>,
  record: { chamferEdge: { pointA: THREE.Vector3; pointB: THREE.Vector3; destNormal: THREE.Vector3 } | null },
): boolean {
  const edge = record.chamferEdge;
  if (!edge) return false;
  const direction = new THREE.Vector3().subVectors(edge.pointB, edge.pointA).normalize();
  const intoDest = new THREE.Vector3().crossVectors(edge.destNormal, direction);
  const mid = edge.pointA.clone().lerp(edge.pointB, 0.5);
  const destMid = surface.uv.project(mid);
  const destStep = surface.uv.project(mid.clone().addScaledVector(intoDest.normalize(), 0.01));
  const fromMid = from.uv.project(mid);
  const fromStep = from.uv.project(mid.clone().addScaledVector(intoDest.negate(), 0.01));
  const sourceU = fromStep.u - fromMid.u;
  const sourceV = fromStep.v - fromMid.v;
  const destU = destStep.u - destMid.u;
  const destV = destStep.v - destMid.v;
  return sourceU * destU + sourceV * destV < 0;
}

/**
 * Builds a unit box brush instance at the origin.
 *
 * @returns Instance with an identity mesh.
 */
function brushInstanceAtOrigin(): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(1, 1, 1);
  const instance = new SolidBrushInstance('brush-a', 'Box', brush);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh = mesh;
  mesh.updateMatrixWorld(true);
  return instance;
}

/**
 * Builds a small volume around the unit box edge at y=0.5, z=0.5.
 *
 * @returns Bevel volume.
 */
function volumeOverTopFrontEdge(): THREE.Mesh {
  const volume = ModifierVolumeBevel.create();
  volume.position.set(0, 0.5, 0.5);
  volume.scale.set(0.3, 0.15, 0.15);
  volume.updateMatrixWorld(true);
  return volume;
}

/**
 * Returns whether any vertex lies near a point.
 *
 * @param vertices Vertices to search.
 * @param point Expected point.
 * @returns True when one vertex is within 0.02.
 */
function hasVertexNear(vertices: readonly THREE.Vector3[], point: THREE.Vector3): boolean {
  return vertices.some((vertex) => vertex.distanceTo(point) < 0.02);
}
