import * as THREE from 'three';
import { expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import type { GeneratorValue } from '@/modifier/generator/modifier_generator_types.js';
import { generatorExpand } from '@/modifier/generator/modifier_generator_expansion.js';

/**
 * Builds an asymmetric source inside a selector. @param kind Strategy. @param
 * parameters Overrides. @param count Placement count.
 */
export function generatorFixture(kind: string, parameters: Record<string, GeneratorValue> = {}, count = 3) {
  const world = new THREE.Group();
  const model = new SolidModel('Array numeric test');
  world.add(model.root);
  const source = model.addBoxBrush(1, SolidOperation.Additive);
  source.mesh?.position.set(2, 0, 0);
  source.mesh?.scale.set(1, 2, 0.5);
  const volume = ModifierGeneratorVolume.create(kind);
  volume.scale.setScalar(8);
  ModifierGeneratorVolume.write(volume, { ...ModifierGeneratorVolume.read(volume), count, parameters });
  world.add(volume);
  world.updateMatrixWorld(true);
  const expand = () => {
    world.updateMatrixWorld(true);
    return generatorExpand(model.getBrushes(), model.root);
  };
  return { world, model, source, volume, expand };
}
/**
 * Verifies outward planes and valid twin links of every derived shell. @param
 * instance Convex output.
 */
export function expectGeneratorConvex(instance: SolidBrushInstance): void {
  for (const plane of instance.brush.planes) {
    for (const vertex of instance.brush.vertices) expect(plane.signedDistance(vertex)).toBeLessThan(1e-6);
  }
  instance.brush.wingEdges.forEach((edge, index) =>
    expect(instance.brush.wingEdges[edge.twinIndex]?.twinIndex).toBe(index),
  );
}
