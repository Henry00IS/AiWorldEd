import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { textureEmbeddedIdsIn } from '@/texture/embedded/texture_embedded_references.js';

const A = `embedded:${'a'.repeat(64)}.png`;
const B = `embedded:${'b'.repeat(64)}.jpg`;

describe('textureEmbeddedIdsIn', () => {
  it('finds embedded ids in kept objects, maps, sets and cycles, and nothing else', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.userData['faceSurfaces'] = { surfaces: [{ textureId: A }] };
    const command: Record<string, unknown> = { removed: [mesh], before: new Map([['x', new Set([B])]]) };
    command['self'] = command;
    const ids = textureEmbeddedIdsIn([command, 'walls/brick.png', `embedded:${'c'.repeat(63)}.png`]);
    expect([...ids!].sort()).toEqual([A, B]);
  });

  it('does not follow parent links or search binary data', () => {
    const world = new THREE.Group();
    world.userData['id'] = A;
    const child = new THREE.Object3D();
    world.add(child);
    expect(textureEmbeddedIdsIn([child, new TextEncoder().encode(B)])).toEqual(new Set());
  });
});
