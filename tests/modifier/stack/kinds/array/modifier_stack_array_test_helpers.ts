import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture, type StackFixtureStep } from '../../modifier_stack_fixture.js';

/**
 * Returns the model-space centre of one compiled brush.
 *
 * @param instance Compiled brush.
 * @returns Centre.
 */
export function arrayTestCentre(instance: SolidBrushInstance): THREE.Vector3 {
  const box = new THREE.Box3();
  const matrix = instance.getModelSpaceMatrix();
  for (const vertex of instance.brush.vertices) box.expandByPoint(vertex.clone().applyMatrix4(matrix));
  return box.getCenter(new THREE.Vector3());
}

/**
 * Compiles the unit cube fixture through some steps and returns the centres of
 * every compiled brush, original first.
 *
 * @param steps Stack.
 * @returns Centres.
 */
export function arrayTestCentres(steps: readonly StackFixtureStep[]): THREE.Vector3[] {
  return stackFixture(steps, 40).compile().instances.map(arrayTestCentre);
}
