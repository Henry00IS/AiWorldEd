import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import {
  MODIFIER_STACK_MIRROR_GUIDE_KEY,
  modifierStackMirrorGuideSync,
} from '@/modifier/stack/ui/modifier_stack_mirror_guide.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Returns the guide children of a volume.
 *
 * @param volume Modifier volume.
 * @returns Guide line sets.
 */
function guides(volume: THREE.Object3D): THREE.LineSegments[] {
  return volume.children.filter(
    (child) => child.userData[MODIFIER_STACK_MIRROR_GUIDE_KEY] === true,
  ) as THREE.LineSegments[];
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
    modifierStackMirrorGuideSync(fixture.volume, true);
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
    modifierStackMirrorGuideSync(fixture.volume, true);
    modifierStackMirrorGuideSync(fixture.volume, true);
    expect(guides(fixture.volume)).toHaveLength(1);
    const saved = JSON.stringify(new SceneSerializer().serialize(fixture.world));
    expect(saved).not.toContain(MODIFIER_STACK_MIRROR_GUIDE_KEY);
    modifierStackMirrorGuideSync(fixture.volume, false);
    expect(fixture.volume.children).toHaveLength(children);
  });
});
