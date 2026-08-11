import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPlayerCapsuleContactScratch,
  playerCapsuleQueryContacts,
} from '@/player/collision/player_capsule_contact_query.js';
import { PlayerTriangleSoup } from '@/player/collision/player_triangle_soup.js';
import { PLAYER_COLLIDER_RADIUS_METERS } from '@/player/player_constants.js';

/**
 * Builds a box mesh at the given world center with the given size.
 *
 * @param center World center.
 * @param size Box size.
 * @returns Mesh ready for collision.
 */
function createBoxMesh(center: THREE.Vector3, size: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('playerCapsuleQueryContacts', () => {
  it('reports a walkable floor contact under the capsule', () => {
    const soup = new PlayerTriangleSoup();
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(4, 1, 4)));
    const scratch = createPlayerCapsuleContactScratch();
    const contacts = playerCapsuleQueryContacts(soup, new THREE.Vector3(0, 0, 0), scratch);
    const walkable = contacts.filter((contact) => contact.isWalkable);
    expect(walkable.length).toBeGreaterThan(0);
  });

  it('reports a non-walkable wall contact when overlapping a wall', () => {
    const soup = new PlayerTriangleSoup();
    soup.bakeMesh(createBoxMesh(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(4, 1, 4)));
    soup.bakeMesh(
      createBoxMesh(new THREE.Vector3(PLAYER_COLLIDER_RADIUS_METERS * 0.5, 1, 0), new THREE.Vector3(1, 2, 2)),
    );
    const scratch = createPlayerCapsuleContactScratch();
    const contacts = playerCapsuleQueryContacts(soup, new THREE.Vector3(0, 0, 0), scratch);
    const walls = contacts.filter((contact) => !contact.isWalkable && contact.depth > 0);
    expect(walls.length).toBeGreaterThan(0);
  });
});
