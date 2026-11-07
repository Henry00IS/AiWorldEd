import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generatorRevolveRunBrush } from '@/generator/revolve/generator_revolve_brush.js';
import { generatorRevolveSurfaces } from '@/generator/revolve/generator_revolve_surface.js';

describe('revolve surfaces', () => {
  it('wraps U around the sides without seams between faces and keeps caps default', () => {
    const frame = { center: new THREE.Vector3(), sides: 6 };
    const brush = generatorRevolveRunBrush(frame, [
      { height: 0, radius: 1 },
      { height: 1, radius: 1 },
    ]);
    if (!brush) throw new Error('Expected a brush');
    const surfaces = generatorRevolveSurfaces(brush, frame);
    const caps = brush.planes.filter((plane) => Math.abs(plane.normal.y) > 0.9).length;
    expect(surfaces.filter((surface) => !surface)).toHaveLength(caps);
    const shared = new Map<string, number[]>();
    brush.faces.forEach((face, index) => {
      const surface = surfaces[index];
      if (!surface) return;
      for (const corner of brush.getFaceVertexIndices(face)) {
        const vertex = brush.vertices[corner];
        if (!vertex || vertex.y > 0.5) continue;
        const key = `${vertex.x.toFixed(3)},${vertex.z.toFixed(3)}`;
        shared.set(key, [...(shared.get(key) ?? []), surface.uv.project(vertex).u]);
      }
    });
    const seams = [...shared.values()].filter((values) => Math.abs((values[0] ?? 0) - (values[1] ?? 0)) > 1e-6);
    expect(seams.length).toBeLessThanOrEqual(1);
    const width = 2 * Math.cos(Math.PI / 6) * Math.tan(Math.PI / 6);
    const span = [...shared.values()].flat();
    expect(Math.max(...span) - Math.min(...span)).toBeCloseTo(width * 6, 4);
  });
});
