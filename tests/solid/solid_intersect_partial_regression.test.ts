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

describe('Intersecting brush peer-local regression (routing tables)', () => {
  it('keeps shared volume when intersect is added after many additives (full)', () => {
    const brushes: SolidBrushInstance[] = [];
    for (let i = 0; i < 8; i++) {
      brushes.push(makeBox(`a${i}`, 2, SolidOperation.Additive, new THREE.Vector3(i * 4, 0, 0)));
    }
    const target = brushes[2]!;
    const inter = makeBox('inter', 2, SolidOperation.Intersecting, target.position.clone());
    brushes.push(inter);
    const polygons = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    const fromTarget = polygons.filter((p) => p.brushId === target.id);
    const fromInter = polygons.filter((p) => p.brushId === 'inter');
    const far = polygons.filter((p) => p.brushId === brushes[7]!.id);
    expect(polygons.length, 'solid should have surfaces').toBeGreaterThan(0);
    expect(fromTarget.length + fromInter.length, 'touched volume must emit surfaces').toBeGreaterThan(0);
    expect(far.length, 'far non-touching additive keeps solid surfaces').toBeGreaterThan(0);
  });

  it('keeps shared volume when intersect is added via partial dirty of new brush only', () => {
    const brushes: SolidBrushInstance[] = [];
    for (let i = 0; i < 8; i++) {
      brushes.push(makeBox(`a${i}`, 2, SolidOperation.Additive, new THREE.Vector3(i * 4, 0, 0)));
    }
    const compiler = new SolidCsgCompiler();
    compiler.compile(brushes, { forceFull: true });
    const beforeCount = compiler.getCachedPolygons(brushes[2]!.id)?.length ?? 0;
    expect(beforeCount).toBeGreaterThan(0);

    const target = brushes[2]!;
    const inter = makeBox('inter', 2, SolidOperation.Intersecting, target.position.clone());
    brushes.push(inter);
    compiler.compile(brushes, { dirtyBrushIds: ['inter'] });

    const afterTarget = compiler.getCachedPolygons(target.id) ?? [];
    const afterInter = compiler.getCachedPolygons('inter') ?? [];
    const far = compiler.getCachedPolygons(brushes[7]!.id) ?? [];

    expect(afterTarget.length + afterInter.length, 'partial add of intersect wiped touched solid').toBeGreaterThan(0);
    expect(far.length, 'far non-touching additive keeps solid surfaces').toBeGreaterThan(0);

    const full = new SolidCsgCompiler().compile(brushes, { forceFull: true });
    const fullTouched =
      full.filter((p) => p.brushId === target.id).length + full.filter((p) => p.brushId === 'inter').length;
    expect(fullTouched).toBeGreaterThan(0);
  });

  it('two-box intersect still produces the shared region', () => {
    const a = makeBox('a', 2, SolidOperation.Additive, new THREE.Vector3(-0.5, 0, 0));
    const b = makeBox('b', 2, SolidOperation.Intersecting, new THREE.Vector3(0.5, 0, 0));
    const polygons = new SolidCsgCompiler().compile([a, b], { forceFull: true });
    expect(polygons.length).toBeGreaterThanOrEqual(6);
  });
});
