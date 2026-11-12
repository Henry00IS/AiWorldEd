import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierStackDerivedByRoot } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { stackFixture, type StackFixtureStep } from '../../modifier/stack/modifier_stack_fixture.js';

/**
 * Builds a solid whose 1 m box brush (top at y = 0.5 + 0.3) sits off the center
 * of a modifier volume, compiled once so its copies exist.
 *
 * @param steps Modifier steps, for example `['mirror']`.
 * @returns Stack fixture with a `rebuild` helper.
 */
export function paintCopyFixture(steps: readonly StackFixtureStep[]) {
  const fixture = stackFixture(steps, 8);
  fixture.source.mesh!.position.set(2, 0.3, 0.1);
  const rebuild = () => {
    fixture.world.updateMatrixWorld(true);
    fixture.model.syncBrushesFromScene();
    fixture.refresh();
    fixture.model.markDirty();
    fixture.model.rebuild(true);
  };
  rebuild();
  return { ...fixture, rebuild };
}

/**
 * Returns the derived brushes of a model's last compile.
 *
 * @param root Solid root.
 * @returns Derived brushes.
 */
export function paintCopyDerived(root: THREE.Object3D): SolidBrushInstance[] {
  return [...(modifierStackDerivedByRoot.get(root)?.values() ?? [])];
}

/**
 * Returns the center of a brush's vertices.
 *
 * @param brush Brush whose vertices are in model space (derived) or local
 *   space.
 * @returns Center.
 */
export function paintCopyCenter(brush: SolidBrushInstance): THREE.Vector3 {
  return new THREE.Box3().setFromPoints(brush.brush.vertices).getCenter(new THREE.Vector3());
}

/**
 * Adds a decal volume of a plain color hovering over a point, projecting down.
 *
 * @param world World.
 * @param center Surface point to cover.
 * @param color Decal color.
 * @returns Volume.
 */
export function paintCopyDecal(world: THREE.Object3D, center: THREE.Vector3, color = '#0000ff'): THREE.Object3D {
  const volume = modifierVolumeTemplateCreate('decal');
  volume.position.copy(center);
  volume.scale.set(0.6, 0.6, 0.6);
  const settings = ModifierVolume.read(volume);
  ModifierVolume.write(volume, {
    ...settings,
    modifiers: settings.modifiers.map((step) => ({ ...step, parameters: { ...step.parameters, color, edgeFade: 0 } })),
  });
  world.add(volume);
  world.updateMatrixWorld(true);
  return volume;
}
