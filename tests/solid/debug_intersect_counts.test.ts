import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Configured instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) instance.position.copy(position);
  return instance;
}

describe('Peer-local intersection CSG (routing tables)', () => {
  it('keeps far non-touching additives when inter is at the end', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    const c = makeBox('c', 2, SolidOperation.Intersecting, new THREE.Vector3(0, 0, 0));
    const polygons = new SolidCsgCompiler().compile([a, b, c], { forceFull: true });
    const bCount = polygons.filter((p) => p.brushId === 'b').length;
    expect(bCount, 'far additive stays solid when it does not touch ∩').toBeGreaterThan(0);
    expect(polygons.length).toBeGreaterThan(0);
  });

  it('partial introduce of inter does not clear far non-touching surfaces', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    const c = makeBox('c', 2, SolidOperation.Additive, new THREE.Vector3(0.3, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([a, b, c], { forceFull: true });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
    c.operation = SolidOperation.Intersecting;
    const partial = compiler.compile([a, b, c], { dirtyBrushIds: ['c'] });
    const full = new SolidCsgCompiler().compile([a, b, c], { forceFull: true });
    const bPartial = compiler.getCachedPolygons('b')?.length ?? 0;
    const bFull = full.filter((p) => p.brushId === 'b').length;
    expect(bPartial).toBeGreaterThan(0);
    expect(bFull).toBeGreaterThan(0);
    expect(partial.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(0);
  });

  it('keeps far additives when an intersecting op is cleared', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(0, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Additive, new THREE.Vector3(10, 0, 0));
    const c = makeBox('c', 2, SolidOperation.Intersecting, new THREE.Vector3(0, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([a, b, c], { forceFull: true });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
    c.operation = SolidOperation.Additive;
    compiler.compile([a, b, c], { dirtyBrushIds: ['c'] });
    expect(compiler.getCachedPolygons('b')?.length ?? 0).toBeGreaterThan(0);
  });

  it('keeps shared volume for co-located additive and intersecting', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(-0.5, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Intersecting, new THREE.Vector3(0.5, 0, 0));
    const polygons = new SolidCsgCompiler().compile([a, b], { forceFull: true });
    expect(polygons.length).toBeGreaterThanOrEqual(6);
  });
});
