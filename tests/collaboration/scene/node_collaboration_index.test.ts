import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IndexCollaborationNodes } from '@/collaboration/scene/node_collaboration_index.js';
import { PLAYER_FIGURINE_USERDATA_KEY } from '@/player/player_constants.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview_keys.js';

/**
 * Creates a named box mesh.
 *
 * @param name Object name.
 * @returns Mesh.
 */
function meshNamed(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** The node index only lists scene content, never editor helpers. */
describe('node_collaboration_index', () => {
  it('indexes content meshes and groups but skips the player figurine and clip previews', () => {
    const world = new THREE.Group();
    const content = meshNamed('Content');
    const folder = new THREE.Group();
    folder.name = 'Folder';
    folder.add(meshNamed('Nested'));
    const figurine = new THREE.Group();
    figurine.userData[PLAYER_FIGURINE_USERDATA_KEY] = true;
    figurine.add(meshNamed('Figurine part'));
    const preview = meshNamed('Preview');
    preview.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
    world.add(content, folder, figurine, preview);
    const names = new IndexCollaborationNodes(world).refs.map((ref) => ref.object.name);
    expect(names).toEqual(['Content', 'Folder', 'Nested']);
  });
});
