import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import {
  MODIFIER_STACK_HELPER_KEY,
  modifierStackHelpersSync,
} from '@/modifier/stack/helpers/modifier_stack_helpers.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Returns the guide children of a volume.
 *
 * @param volume Modifier volume.
 * @returns Guide line sets.
 */
function guides(volume: THREE.Object3D): THREE.LineSegments[] {
  return volume.children.filter((child) => child.userData[MODIFIER_STACK_HELPER_KEY] === true) as THREE.LineSegments[];
}

/**
 * Returns the local-space points of a guide.
 *
 * @param guide Guide lines.
 * @returns Points in segment order.
 */
function points(guide: THREE.LineSegments | undefined): THREE.Vector3[] {
  const position = guide?.geometry.getAttribute('position');
  if (!position) throw new Error('Expected a guide');
  return Array.from({ length: position.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(position, index));
}

describe('mirror plane guide', () => {
  it('draws each enabled mirror plane, and an arrow at the kept side when bisecting', () => {
    const fixture = stackFixture([
      { kind: 'mirror', parameters: { axis: 'x', plane: 'max', bisect: true } },
      { kind: 'mirror', parameters: { axis: 'y' } },
      { kind: 'mirror', parameters: { axis: 'z' }, enabled: false },
    ]);
    modifierStackHelpersSync(fixture.volume, true);
    const [bisect, plain] = guides(fixture.volume);
    expect(guides(fixture.volume)).toHaveLength(2);
    expect(
      points(bisect)
        .slice(0, 12)
        .every((point) => Math.abs(point.x - 0.5) < 1e-9),
    ).toBe(true);
    expect(points(bisect)[13]?.x).toBeLessThan(0.5);
    expect(points(plain)).toHaveLength(12);
    expect(points(plain).every((point) => Math.abs(point.y) < 1e-9)).toBe(true);
  });

  it('replaces old guides, clears them, and never saves them', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x' } }]);
    const children = fixture.volume.children.length;
    modifierStackHelpersSync(fixture.volume, true);
    modifierStackHelpersSync(fixture.volume, true);
    expect(guides(fixture.volume)).toHaveLength(1);
    const saved = JSON.stringify(new SceneSerializer().serialize(fixture.world));
    expect(saved).not.toContain(MODIFIER_STACK_HELPER_KEY);
    modifierStackHelpersSync(fixture.volume, false);
    expect(fixture.volume.children).toHaveLength(children);
  });

  it('follows stack changes made outside the inspector, while shown', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x' } }]);
    modifierStackHelpersSync(fixture.volume, true);
    const settings = ModifierVolume.read(fixture.volume);
    settings.modifiers[0]!.parameters['plane'] = 'max';
    ModifierVolume.write(fixture.volume, settings);
    modifierBevelRefreshScene(fixture.world);
    expect(points(guides(fixture.volume)[0]).every((point) => Math.abs(point.x - 0.5) < 1e-9)).toBe(true);
    modifierStackHelpersSync(fixture.volume, false);
    modifierBevelRefreshScene(fixture.world);
    expect(guides(fixture.volume)).toHaveLength(0);
  });

  it('draws a world-axes plane at the world bounds of a rotated volume', () => {
    const fixture = stackFixture([{ kind: 'mirror', parameters: { axis: 'x', plane: 'max', space: 'world' } }]);
    fixture.volume.rotation.y = Math.PI / 4;
    fixture.world.updateMatrixWorld(true);
    modifierStackHelpersSync(fixture.volume, true);
    fixture.volume.updateMatrixWorld(true);
    const world = points(guides(fixture.volume)[0]).map((point) => point.applyMatrix4(fixture.volume.matrixWorld));
    expect(world.every((point) => Math.abs(point.x - 4 * Math.SQRT2) < 1e-6)).toBe(true);
  });
});
