import * as THREE from 'three';
import { PHYSICS_TOY_SHAPES, type PhysicsToyKind } from '@/physics/ball/physics_ball_constants.js';

/** Toy kinds in picker order. */
export const PLAYER_TOY_KINDS: readonly PhysicsToyKind[] = ['tennis', 'soccer', 'plane'];

/** Picker labels of the toy kinds. */
export const PLAYER_TOY_LABELS: Readonly<Record<PhysicsToyKind, string>> = {
  tennis: 'Tennis ball',
  soccer: 'Soccer ball',
  plane: 'Paper plane',
};

/** Paper plane length from nose to tail. */
const PLAYER_TOY_PLANE_LENGTH = 0.28;
/** Paper plane wing span. */
const PLAYER_TOY_PLANE_SPAN = 0.2;
/** Angle from a patch center within which a soccer ball triangle is dark. */
const PLAYER_TOY_SOCCER_PATCH_RADIANS = 0.34;
/** Paper color. */
const PLAYER_TOY_PAPER_COLOR = 0xf4f1e8;

const geometries = new Map<PhysicsToyKind, THREE.BufferGeometry>();

/**
 * Returns the shared geometry of a toy kind. Soccer balls and paper planes have
 * two groups: 0 drawn white (paper, leather), 1 in the member color (patches,
 * keel).
 *
 * @param kind Toy kind.
 * @returns Geometry (do not dispose).
 */
export function playerToyGeometry(kind: PhysicsToyKind): THREE.BufferGeometry {
  let geometry = geometries.get(kind);
  if (geometry === undefined) {
    geometry = kind === 'tennis' ? playerToyTennis() : kind === 'soccer' ? playerToySoccer() : playerToyPlane();
    geometries.set(kind, geometry);
  }
  return geometry;
}

/**
 * Creates the materials of a toy in a member color: one material for a tennis
 * ball, white and color for the others (matching the geometry groups).
 *
 * @param kind Toy kind.
 * @param color Member color.
 * @returns Material or materials (owned by the caller).
 */
export function playerToyMaterials(
  kind: PhysicsToyKind,
  color: number,
): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
  if (kind === 'tennis') return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const side = kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide;
  const roughness = kind === 'plane' ? 0.95 : 0.55;
  return [
    new THREE.MeshStandardMaterial({ color: PLAYER_TOY_PAPER_COLOR, roughness, side }),
    new THREE.MeshStandardMaterial({ color, roughness, side }),
  ];
}

/**
 * Builds a toy mesh with its own materials (for held items and the view model);
 * raycasts never hit it.
 *
 * @param kind Toy kind.
 * @param color Member color.
 * @returns Mesh.
 */
export function playerToyMesh(kind: PhysicsToyKind, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(playerToyGeometry(kind), playerToyMaterials(kind, color));
  mesh.name = PLAYER_TOY_LABELS[kind];
  mesh.raycast = () => undefined;
  return mesh;
}

/**
 * Frees the materials of a mesh made by playerToyMesh (the geometry is shared).
 *
 * @param mesh Toy mesh.
 */
export function playerToyMeshDispose(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => material.dispose());
}

/**
 * Tennis ball sphere.
 *
 * @returns Geometry.
 */
function playerToyTennis(): THREE.BufferGeometry {
  return new THREE.SphereGeometry(PHYSICS_TOY_SHAPES.tennis.radius, 16, 12);
}

/**
 * Soccer ball: a smooth geodesic sphere whose triangles around the twelve
 * icosahedron corners form the dark patches.
 *
 * @returns Geometry with a white and a patch group.
 */
function playerToySoccer(): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(PHYSICS_TOY_SHAPES.soccer.radius, 4);
  const { white, patch } = playerToySoccerSplit(source.getAttribute('position'), playerToySoccerCenters());
  source.dispose();
  const all = new Float32Array([...white, ...patch]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(all, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(playerToySphereNormals(all), 3));
  geometry.addGroup(0, white.length / 3, 0);
  geometry.addGroup(white.length / 3, patch.length / 3, 1);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Returns the twelve distinct icosahedron corner directions.
 *
 * @returns Unit vectors.
 */
function playerToySoccerCenters(): THREE.Vector3[] {
  const corners = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  const centers: THREE.Vector3[] = [];
  for (let index = 0; index < corners.count; index++) {
    const corner = new THREE.Vector3().fromBufferAttribute(corners, index).normalize();
    if (!centers.some((center) => center.distanceTo(corner) < 1e-3)) centers.push(corner);
  }
  return centers;
}

/**
 * Sorts the triangles of a non-indexed sphere into white ones and dark ones
 * near a patch center.
 *
 * @param positions Triangle vertex positions.
 * @param centers Patch center directions.
 * @returns Flat vertex coordinates of the white and the patch triangles.
 */
function playerToySoccerSplit(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  centers: readonly THREE.Vector3[],
): { white: number[]; patch: number[] } {
  const white: number[] = [];
  const patch: number[] = [];
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let triangle = 0; triangle < positions.count / 3; triangle++) {
    const coordinates: number[] = [];
    centroid.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner++) {
      centroid.add(vertex.fromBufferAttribute(positions, triangle * 3 + corner));
      coordinates.push(vertex.x, vertex.y, vertex.z);
    }
    centroid.normalize();
    const dark = centers.some((center) => center.angleTo(centroid) < PLAYER_TOY_SOCCER_PATCH_RADIANS);
    (dark ? patch : white).push(...coordinates);
  }
  return { white, patch };
}

/**
 * Computes smooth sphere normals (the normalized positions).
 *
 * @param positions Flat vertex coordinates around the origin.
 * @returns Flat normals.
 */
function playerToySphereNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.length; index += 3) {
    vertex.set(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0).normalize();
    normals.set([vertex.x, vertex.y, vertex.z], index);
  }
  return normals;
}

/**
 * Paper plane (a folded dart) facing -Z with its wings up: two wings with a
 * slight dihedral and a keel below the spine reaching down to the bottom of the
 * collision sphere, so it lies on its keel when resting.
 *
 * @returns Geometry with a wing and a keel group.
 */
function playerToyPlane(): THREE.BufferGeometry {
  const half = PLAYER_TOY_PLANE_LENGTH / 2;
  const tip = PLAYER_TOY_PLANE_SPAN / 2;
  const keel = PHYSICS_TOY_SHAPES.plane.radius;
  const nose = [0, 0, -half];
  const tail = [0, 0, half];
  const left = [-tip, 0.02, half];
  const right = [tip, 0.02, half];
  const leftFold = [-tip * 0.35, 0.004, half];
  const rightFold = [tip * 0.35, 0.004, half];
  const keelTail = [0, -keel, half * 0.92];
  const keelNose = [0, -keel * 0.35, -half * 0.55];
  const wings = [nose, leftFold, left, nose, tail, leftFold, nose, right, rightFold, nose, rightFold, tail];
  const keels = [nose, keelNose, tail, keelNose, keelTail, tail];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...wings, ...keels].flat()), 3));
  geometry.computeVertexNormals();
  geometry.addGroup(0, wings.length, 0);
  geometry.addGroup(wings.length, keels.length, 1);
  geometry.computeBoundingSphere();
  return geometry;
}
