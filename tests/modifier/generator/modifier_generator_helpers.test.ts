import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { generatorRefreshScene } from '@/modifier/generator/modifier_generator_refresh.js';
import { generatorStatus } from '@/modifier/generator/modifier_generator_status.js';
import { modifierVolumeIs } from '@/modifier/volume/modifier_volume_is.js';
import { PlayerCollisionWorld } from '@/player/collision/player_collision_world.js';
import { usesContentDecorativeEdges } from '@/utils/mesh_edge_sync.js';

describe('generator selectors are editor helpers', () => {
  it('distinguishes selectors from content and does not add content outlines', () => {
    const selector = ModifierGeneratorVolume.create('unknown');
    expect(modifierVolumeIs(selector)).toBe(true);
    expect(modifierVolumeIs(new Mesh(new BoxGeometry()))).toBe(false);
    expect(usesContentDecorativeEdges(selector)).toBe(false);
  });
  it('clears obsolete derived counts when the last selector is disabled', () => {
    const root = new Group();
    const selector = ModifierGeneratorVolume.create('unknown');
    ModifierGeneratorVolume.write(selector, { kind: 'unknown', enabled: false });
    root.add(selector);
    generatorStatus.set(selector, { sources: [], copies: 5, error: '' });
    generatorRefreshScene(root);
    expect(generatorStatus.has(selector)).toBe(false);
  });
  it('excludes selector geometry from capsule triangles and ray collision', () => {
    const root = new Group();
    const selector = ModifierGeneratorVolume.create('unknown');
    selector.scale.setScalar(4);
    const wall = new Mesh(new BoxGeometry());
    wall.position.x = 4;
    root.add(selector, wall);
    root.updateMatrixWorld(true);
    const collision = new PlayerCollisionWorld();
    collision.setWorldRoot(root);
    expect(collision.getTriangleSoup().getTriangleCount()).toBe(12);
    expect(collision.raycastNearest(new Vector3(-3, 0, 0), new Vector3(1, 0, 0), 10)?.object).toBe(wall);
  });
});
