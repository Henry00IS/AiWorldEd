import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SeamModelConformer } from '@/solid/mesh/seam/seam_model_conformer.js';
import type { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds an axis-aligned rectangle polygon in the y = 0 plane.
 *
 * @param brushId Owning brush id.
 * @param minimumX Smallest x.
 * @param maximumX Largest x.
 * @param minimumZ Smallest z.
 * @param maximumZ Largest z.
 * @returns Polygon facing +y.
 */
function floorRectangle(
  brushId: string,
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
): SolidCompiledPolygon {
  return {
    vertices: [
      new THREE.Vector3(minimumX, 0, minimumZ),
      new THREE.Vector3(minimumX, 0, maximumZ),
      new THREE.Vector3(maximumX, 0, maximumZ),
      new THREE.Vector3(maximumX, 0, minimumZ),
    ],
    normal: new THREE.Vector3(0, 1, 0),
    surfaceIndex: 0,
    brushId,
    textureId: 'floor',
    category: SurfaceCategory.SelfAligned,
  };
}

/**
 * Whether an outline contains a vertex at a position.
 *
 * @param polygon Polygon to search.
 * @param point Position.
 * @returns True when one vertex is at the position.
 */
function hasVertexAt(polygon: SolidCompiledPolygon, point: THREE.Vector3): boolean {
  return polygon.vertices.some((vertex) => vertex.distanceTo(point) < 1e-9);
}

describe('Seam model conformer', () => {
  it('inserts a neighbour corner into the long edge it lies on and keeps untouched polygons as they are', () => {
    const polygons = new Map<string, SolidCompiledPolygon[]>([
      ['wide', [floorRectangle('wide', 0, 4, -1, 0)]],
      ['narrow', [floorRectangle('narrow', 1, 2, 0, 1)]],
    ]);
    const conformer = new SeamModelConformer();
    conformer.refresh(['wide', 'narrow'], ['wide', 'narrow'], (brushId) => polygons.get(brushId));
    const wide = conformer.polygonsForMesh('wide', polygons.get('wide')!)[0]!;
    expect(wide.vertices.length).toBe(6);
    expect(hasVertexAt(wide, new THREE.Vector3(1, 0, 0))).toBe(true);
    expect(hasVertexAt(wide, new THREE.Vector3(2, 0, 0))).toBe(true);
    expect(wide.triangleCorners?.length).toBe(12);
    const narrow = conformer.polygonsForMesh('narrow', polygons.get('narrow')!)[0]!;
    expect(narrow).toBe(polygons.get('narrow')![0]);
  });

  it('reports an untouched neighbour whose edge gains a different corner after only the other brush changed', () => {
    const polygons = new Map<string, SolidCompiledPolygon[]>([
      ['wide', [floorRectangle('wide', 0, 4, -1, 0)]],
      ['narrow', [floorRectangle('narrow', 1, 2, 0, 1)]],
    ]);
    const conformer = new SeamModelConformer();
    conformer.refresh(['wide', 'narrow'], ['wide', 'narrow'], (brushId) => polygons.get(brushId));
    polygons.set('narrow', [floorRectangle('narrow', 2.5, 3, 0, 1)]);
    const changed = conformer.refresh(['wide', 'narrow'], ['narrow'], (brushId) => polygons.get(brushId));
    expect(changed).toEqual(['wide']);
    const wide = conformer.polygonsForMesh('wide', polygons.get('wide')!)[0]!;
    expect(hasVertexAt(wide, new THREE.Vector3(2.5, 0, 0))).toBe(true);
    expect(hasVertexAt(wide, new THREE.Vector3(1, 0, 0))).toBe(false);
  });

  it('reports nothing when a change happens far from every other brush', () => {
    const polygons = new Map<string, SolidCompiledPolygon[]>([
      ['wide', [floorRectangle('wide', 0, 4, -1, 0)]],
      ['far', [floorRectangle('far', 10, 11, 10, 11)]],
    ]);
    const conformer = new SeamModelConformer();
    conformer.refresh(['wide', 'far'], ['wide', 'far'], (brushId) => polygons.get(brushId));
    polygons.set('far', [floorRectangle('far', 10, 12, 10, 11)]);
    expect(conformer.refresh(['wide', 'far'], ['far'], (brushId) => polygons.get(brushId))).toEqual([]);
  });

  it('takes the corners of a removed brush out of its neighbours again', () => {
    const polygons = new Map<string, SolidCompiledPolygon[]>([
      ['wide', [floorRectangle('wide', 0, 4, -1, 0)]],
      ['narrow', [floorRectangle('narrow', 1, 2, 0, 1)]],
    ]);
    const conformer = new SeamModelConformer();
    conformer.refresh(['wide', 'narrow'], ['wide', 'narrow'], (brushId) => polygons.get(brushId));
    expect(conformer.refresh(['wide'], [], (brushId) => polygons.get(brushId))).toEqual(['wide']);
    expect(conformer.polygonsForMesh('wide', polygons.get('wide')!)[0]!.vertices.length).toBe(4);
  });

  /**
   * A corner close to an edge line but steeply off it near an edge end is a
   * separate feature.
   */
  it('skips a corner that sits off the edge line by more than the slope allows near an edge end', () => {
    const polygons = new Map<string, SolidCompiledPolygon[]>([
      ['wide', [floorRectangle('wide', 0, 4, -1, 0)]],
      ['near', [floorRectangle('near', 1, 2, 0.0008, 1)]],
      ['steep', [floorRectangle('steep', 0.02, 0.5, 0.0008, 1)]],
    ]);
    const conformer = new SeamModelConformer();
    conformer.refresh(['wide', 'near', 'steep'], ['wide', 'near', 'steep'], (brushId) => polygons.get(brushId));
    const wide = conformer.polygonsForMesh('wide', polygons.get('wide')!)[0]!;
    expect(hasVertexAt(wide, new THREE.Vector3(1, 0, 0.0008))).toBe(true);
    expect(hasVertexAt(wide, new THREE.Vector3(0.02, 0, 0.0008))).toBe(false);
  });
});
