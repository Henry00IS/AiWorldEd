import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushMeshChunkBuilder } from '@/solid/mesh/solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from '@/solid/mesh/solid_mesh_chunk_cache.js';
import { SolidResultBuffer } from '@/solid/mesh/solid_result_buffer.js';
import { createDefaultFaceSurface } from '@/texture/uv_matrix/face_surface_description.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Builds a positioned additive box brush.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param position Center position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, position: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, SolidOperation.Additive);
  instance.position.copy(position);
  return instance;
}

/**
 * Rebuilds mesh chunks for the given brush ids from compiler caches.
 *
 * @param compiler Compiler with polygon cache.
 * @param chunkCache Destination chunk cache.
 * @param builder Chunk builder.
 * @param brushIds Brush ids to remesh.
 */
function rebuildChunks(
  compiler: SolidCsgCompiler,
  chunkCache: SolidMeshChunkCache,
  builder: SolidBrushMeshChunkBuilder,
  brushIds: string[],
): void {
  const identity = new THREE.Matrix4();
  for (const brushId of brushIds) {
    chunkCache.set(
      brushId,
      builder.build(compiler.getCachedPolygons(brushId) ?? [], () => createDefaultFaceSurface(), {
        brushModelMatrix: identity,
      }),
    );
  }
}

/** Unit tests for segmented solid result buffers and dirty-range patches. */
describe('SolidResultBuffer', () => {
  it('treats empty free-floating cutters as a no-op patch without full rewrite', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('cutter', 2, new THREE.Vector3(40, 0, 0)),
    ];
    brushes[2]!.operation = SolidOperation.Subtractive;
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const sourcesBefore = buffer.getTriangleSources().length;

    brushes[2]!.position.x += 1;
    compiler.compile(brushes, { dirtyBrushIds: ['cutter'], skipPolygonAssembly: true });
    const dirty = compiler.getLastUpdateBrushIds();
    expect(dirty).toEqual(['cutter']);
    rebuildChunks(compiler, chunkCache, builder, dirty);
    expect(chunkCache.get('cutter')?.triangleCount ?? 0).toBe(0);
    const patched = buffer.tryPatchDirty(dirty, compiler.getLastBrushOrder(), chunkCache);
    expect(patched).toBe(true);
    expect(buffer.wasLastWritePartial()).toBe(true);
    expect(buffer.getTriangleSources().length).toBe(sourcesBefore);
  });

  it('patches only dirty brush slices when vertex counts stay stable', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(12, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const before = buffer.getTriangleSources().map((source) => source.brushId);

    brushes[1]!.position.x += 0.4;
    compiler.compile(brushes, {
      dirtyBrushIds: ['b'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    expect(dirty).toContain('b');
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const patched = buffer.tryPatchDirty(dirty, compiler.getLastBrushOrder(), chunkCache);
    expect(patched).toBe(true);
    expect(buffer.wasLastWritePartial()).toBe(true);
    expect(buffer.getLastUpdateRanges().length).toBeGreaterThan(0);
    expect(buffer.getTriangleSources().map((source) => source.brushId)).toEqual(before);

    const full = new SolidResultBuffer();
    full.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const geometry = new THREE.BufferGeometry();
    buffer.uploadToGeometry(geometry);
    const fullGeometry = new THREE.BufferGeometry();
    full.uploadToGeometry(fullGeometry);
    const patchedPos = geometry.getAttribute('position').array as Float32Array;
    const fullPos = fullGeometry.getAttribute('position').array as Float32Array;
    expect(patchedPos.length).toBe(fullPos.length);
    for (let index = 0; index < patchedPos.length; index++) {
      expect(patchedPos[index]!).toBeCloseTo(fullPos[index]!, 5);
    }
  });

  it('patching several brushes keeps clean regions in place and appends patched ones in patch order', () => {
    const brushes = ['a', 'b', 'c', 'd'].map((id, index) => makeBox(id, 2, new THREE.Vector3(index * 6, 0, 0)));
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    brushes[2]!.position.x += 0.25;
    brushes[0]!.position.x += 0.25;
    rebuildChunks(compiler, chunkCache, builder, ['c', 'a']);
    expect(buffer.tryPatchDirty(['c', 'a'], compiler.getLastBrushOrder(), chunkCache)).toBe(true);
    const order = buffer.getSurfaceRegions().map((region) => region.brushId);
    const firstOf = (id: string): number => order.indexOf(id);
    expect(order.filter((id) => id === 'a' || id === 'c').length).toBe(12);
    expect(firstOf('b')).toBeLessThan(firstOf('d'));
    expect(firstOf('d')).toBeLessThan(firstOf('c'));
    expect(firstOf('c')).toBeLessThan(firstOf('a'));
  });

  it('live-moves one brush among many without dropping result triangles', () => {
    const model = new SolidModel('BufferLive');
    const spacing = 5;
    for (let index = 0; index < 36; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.position.set((index % 6) * spacing, 0, Math.floor(index / 6) * spacing);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    const beforeCount = model.getResultMesh().geometry.getAttribute('position').count;
    const mover = model.getBrushes()[3]!;
    mover.mesh!.position.x += 0.2;
    model.syncBrushesFromScene();
    model.rebuildLive();
    const afterCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(afterCount).toBe(beforeCount);
    expect(afterCount).toBeGreaterThan(36 * 12);
  });

  it('patches dirty brushes when evaluation order changes but the brush set is unchanged', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(12, 0, 0)),
      makeBox('d', 2, new THREE.Vector3(18, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const reordered = [brushes[1]!, brushes[2]!, brushes[3]!, brushes[0]!];
    compiler.compile(reordered, {
      dirtyBrushIds: ['a'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const patched = buffer.tryPatchDirty(dirty, compiler.getLastBrushOrder(), chunkCache);
    expect(patched).toBe(true);
    expect(buffer.wasLastWritePartial()).toBe(true);
  });

  it('rebuilds only the suffix when an early-stable brush changes topology later', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(12, 0, 0)),
      makeBox('d', 2, new THREE.Vector3(18, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const prefixA = Array.from(buffer.getTriangleSources().filter((source) => source.brushId === 'a'));

    brushes[2]!.position.copy(brushes[3]!.position);
    compiler.compile(brushes, {
      dirtyBrushIds: ['c'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const order = compiler.getLastBrushOrder();
    const patched = buffer.tryPatchDirty(dirty, order, chunkCache);
    if (!patched) {
      expect(buffer.tryRebuildFromFirstChanged(dirty, order, chunkCache)).toBe(true);
    }
    const afterA = buffer.getTriangleSources().filter((source) => source.brushId === 'a');
    expect(afterA.length).toBe(prefixA.length);

    const full = new SolidResultBuffer();
    full.rebuildFull(order, chunkCache);
    expect(buffer.getTriangleSources().length).toBe(full.getTriangleSources().length);
  });

  it('suffix rebuild rewrites dirty pose-only seeds that sit before a size-changing peer', () => {
    const far = makeBox('far', 2, new THREE.Vector3(30, 0, 0));
    const mover = makeBox('mover', 2, new THREE.Vector3(0, 1.5, 0));
    const peer = makeBox('peer', 6, new THREE.Vector3(0, 0, 0));
    const brushes = [far, mover, peer];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);

    mover.position.set(2.25, 1.5, 0);
    mover.scale.set(1.4, 1.4, 1.4);
    compiler.compile(brushes, {
      dirtyBrushIds: ['mover'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    expect(dirty).toContain('mover');
    expect(dirty).toContain('peer');
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const order = compiler.getLastBrushOrder();
    const patched = buffer.tryPatchDirty(dirty, order, chunkCache);
    if (!patched) {
      expect(buffer.tryRebuildFromFirstChanged(dirty, order, chunkCache)).toBe(true);
    }

    const full = new SolidResultBuffer();
    full.rebuildFull(order, chunkCache);
    const geometry = new THREE.BufferGeometry();
    buffer.uploadToGeometry(geometry);
    const fullGeometry = new THREE.BufferGeometry();
    full.uploadToGeometry(fullGeometry);
    const sources = buffer.getTriangleSources();
    const fullSources = full.getTriangleSources();
    expect(sources.length).toBe(fullSources.length);
    const position = geometry.getAttribute('position');
    const fullPosition = fullGeometry.getAttribute('position');
    let moverSum = 0;
    let moverCount = 0;
    let fullMoverSum = 0;
    let fullMoverCount = 0;
    for (let triangle = 0; triangle < sources.length; triangle++) {
      if (sources[triangle]!.brushId !== 'mover') {
        continue;
      }
      for (let corner = 0; corner < 3; corner++) {
        const vertex = triangle * 3 + corner;
        moverSum += position.getX(vertex);
        moverCount += 1;
      }
    }
    for (let triangle = 0; triangle < fullSources.length; triangle++) {
      if (fullSources[triangle]!.brushId !== 'mover') {
        continue;
      }
      for (let corner = 0; corner < 3; corner++) {
        const vertex = triangle * 3 + corner;
        fullMoverSum += fullPosition.getX(vertex);
        fullMoverCount += 1;
      }
    }
    expect(moverCount).toBeGreaterThan(0);
    expect(moverCount).toBe(fullMoverCount);
    expect(moverSum / moverCount).toBeCloseTo(fullMoverSum / fullMoverCount, 4);
  });
});
