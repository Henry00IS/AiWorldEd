import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushMeshChunk, SolidBrushMeshChunkBuilder } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { FaceSurfaceDescription } from '@/texture/uv_matrix/face_surface_description.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { shouldReverseSurfaceWinding } from '@/solid/types/surface_category.js';

/**
 * Compiles one box brush and bakes its chunk with per-face authored UVs built
 * from the original (brush-outward) face normal, like the editor does.
 *
 * @param operation Brush operation.
 * @param invertedWorld Whether CSG starts solid.
 * @param rotationDeg UV rotation in degrees.
 * @param offset UV translation.
 * @param scale UV scale on both axes.
 * @returns Baked chunk and the compiled polygons.
 */
function bakeBox(
  operation: SolidOperation,
  invertedWorld: boolean,
  rotationDeg: number,
  offset: THREE.Vector2,
  scale: number,
): { chunk: SolidBrushMeshChunk; polygons: SolidCompiledPolygon[] } {
  const instance = new SolidBrushInstance('box', 'box', SolidBrushFactory.createCenteredBox(4, 3, 5), operation);
  const compiler = new SolidCsgCompiler();
  compiler.compile([instance], { forceFull: true, invertedWorld });
  const polygons = compiler.getCachedPolygons('box') ?? [];
  const surfaceByIndex = new Map<number, FaceSurfaceDescription>();
  for (const polygon of polygons) {
    const brushOutwardNormal = shouldReverseSurfaceWinding(polygon.category)
      ? polygon.normal.clone().negate()
      : polygon.normal.clone();
    surfaceByIndex.set(polygon.surfaceIndex, {
      textureId: 'test',
      uv: SurfaceUvMatrix.fromTrs(offset, brushOutwardNormal, rotationDeg, scale, scale),
    });
  }
  const chunk = new SolidBrushMeshChunkBuilder().build(polygons, (index) => surfaceByIndex.get(index)!, {
    brushModelMatrix: new THREE.Matrix4(),
  });
  return { chunk, polygons };
}

/**
 * Returns the sign of each triangle's signed UV area in rendered winding order.
 * A texture reads unmirrored when this matches a front-facing additive brush.
 *
 * @param chunk Baked chunk.
 * @returns One sign per triangle.
 */
function triangleUvHandedness(chunk: SolidBrushMeshChunk): number[] {
  const signs: number[] = [];
  for (let triangle = 0; triangle < chunk.triangleCount; triangle++) {
    const base = triangle * 6;
    const uv = chunk.uvs;
    const area =
      (uv[base + 2]! - uv[base]!) * (uv[base + 5]! - uv[base + 1]!) -
      (uv[base + 4]! - uv[base]!) * (uv[base + 3]! - uv[base + 1]!);
    signs.push(Math.sign(area));
  }
  return signs;
}

/** Inverted-world and other reversed cavity faces must not mirror textures. */
describe('Solid mesh chunk reversed-face UVs', () => {
  const variants = [
    { rotationDeg: 0, offset: new THREE.Vector2(0, 0), scale: 1 },
    { rotationDeg: 37, offset: new THREE.Vector2(0.3, -0.7), scale: 0.5 },
    { rotationDeg: -120, offset: new THREE.Vector2(2.25, 0.1), scale: 2 },
  ];

  for (const variant of variants) {
    it(`inverted-world faces share front-face handedness (rot ${variant.rotationDeg})`, () => {
      const front = bakeBox(SolidOperation.Additive, false, variant.rotationDeg, variant.offset, variant.scale);
      const cavity = bakeBox(SolidOperation.Subtractive, true, variant.rotationDeg, variant.offset, variant.scale);
      const frontSigns = triangleUvHandedness(front.chunk);
      const cavitySigns = triangleUvHandedness(cavity.chunk);
      expect(cavity.polygons.every((polygon) => shouldReverseSurfaceWinding(polygon.category))).toBe(true);
      expect(cavity.chunk.triangleCount).toBeGreaterThan(0);
      expect(new Set(frontSigns).size).toBe(1);
      expect(new Set(cavitySigns)).toEqual(new Set(frontSigns));
      expect(frontSigns[0]).not.toBe(0);
    });
  }

  it('keeps V and tile seams of reversed faces at the authored positions', () => {
    const offset = new THREE.Vector2(0.3, -0.7);
    const cavity = bakeBox(SolidOperation.Subtractive, true, 25, offset, 0.75);
    const corners = cavity.chunk.vertexCount;
    for (let corner = 0; corner < corners; corner++) {
      const triangle = Math.floor(corner / 3);
      const polygon = cavity.polygons.find((candidate) => candidate.surfaceIndex === sourceSurface(cavity, triangle));
      expect(polygon).toBeDefined();
      const position = new THREE.Vector3().fromArray(cavity.chunk.positions, corner * 3);
      const authored = SurfaceUvMatrix.fromTrs(offset, polygon!.normal.clone().negate(), 25, 0.75, 0.75).project(
        position,
      );
      const bakedU = cavity.chunk.uvs[corner * 2]!;
      const bakedV = cavity.chunk.uvs[corner * 2 + 1]!;
      expect(bakedV).toBeCloseTo(authored.v, 5);
      const seamPhaseSum = bakedU + authored.u;
      expect(seamPhaseSum - Math.round(seamPhaseSum)).toBeCloseTo(0, 5);
    }
  });
});

/**
 * Returns the surface index a baked triangle came from.
 *
 * @param baked Baked chunk with polygons.
 * @param triangle Triangle index.
 * @returns Source surface index.
 */
function sourceSurface(baked: { chunk: SolidBrushMeshChunk }, triangle: number): number {
  return baked.chunk.triangleSources[triangle]!.surfaceIndex;
}
