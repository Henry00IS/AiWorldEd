import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { groupSelectionsIntoFaceRegions } from '../../src/selection/face_region_grouper.js';
import { findCoplanarFaceIndices } from '../../src/selection/triangle_geometry_utils.js';
import { FaceSelection } from '../../src/selection/face_selection_manager.js';

describe('groupSelectionsIntoFaceRegions', () => {
  it('should return one region for a single coplanar box face', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const faceIndices = findCoplanarFaceIndices(mesh.geometry, 0);
    const selections: FaceSelection[] = faceIndices.map((faceIndex) => ({
      mesh,
      faceIndex
    }));
    const regions = groupSelectionsIntoFaceRegions(selections);
    expect(regions.length).toBe(1);
    expect(regions[0].faceIndices.length).toBe(faceIndices.length);
  });

  it('should return two regions when two different box faces are selected', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const faceA = findCoplanarFaceIndices(mesh.geometry, 0);
    const faceB = findCoplanarFaceIndices(mesh.geometry, 4);
    const selections: FaceSelection[] = [
      ...faceA.map((faceIndex) => ({ mesh, faceIndex })),
      ...faceB.map((faceIndex) => ({ mesh, faceIndex }))
    ];
    const regions = groupSelectionsIntoFaceRegions(selections);
    expect(regions.length).toBe(2);
    expect(regions[0].mesh).toBe(mesh);
    expect(regions[1].mesh).toBe(mesh);
  });

  it('should group regions across multiple meshes independently', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const faceA = findCoplanarFaceIndices(meshA.geometry, 0);
    const faceB = findCoplanarFaceIndices(meshB.geometry, 0);
    const selections: FaceSelection[] = [
      ...faceA.map((faceIndex) => ({ mesh: meshA, faceIndex })),
      ...faceB.map((faceIndex) => ({ mesh: meshB, faceIndex }))
    ];
    const regions = groupSelectionsIntoFaceRegions(selections);
    expect(regions.length).toBe(2);
    expect(regions.some((region) => region.mesh === meshA)).toBe(true);
    expect(regions.some((region) => region.mesh === meshB)).toBe(true);
  });

  it('should return empty for empty selection', () => {
    expect(groupSelectionsIntoFaceRegions([])).toEqual([]);
  });
});
