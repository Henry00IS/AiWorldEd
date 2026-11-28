import * as THREE from 'three';

/** Meters per unit of the gun's design (it is about 25 cm long). */
const PLAYER_GRAPPLE_GUN_SCALE = 0.07;
/** Name of the gun's muzzle marker (where the beam leaves it). */
const PLAYER_GRAPPLE_GUN_MUZZLE = 'Grapple muzzle';

/** One box of the gun in design units: size, center and turn about X. */
interface PlayerGrappleGunBox {
  size: readonly [number, number, number];
  at: readonly [number, number, number];
  material: 'body' | 'metal' | 'grip' | 'accent';
  tilt?: number;
}

/**
 * The gun in design units (+Z ahead, +Y up): a receiver with a recessed glowing
 * side strip, a forked muzzle of two prongs around a glowing emitter, a raked
 * grip under the rear, and two ring sights on top (added as arcs) to look
 * through along the barrel. The glowing accents take the player's color.
 */
const PLAYER_GRAPPLE_GUN_BOXES: readonly PlayerGrappleGunBox[] = [
  { size: [0.62, 1.15, 2.5], at: [0, 0, -1.05], material: 'body' },
  { size: [0.66, 0.42, 1.5], at: [0, 0.08, -0.95], material: 'metal' },
  { size: [0.68, 0.1, 1.3], at: [0, 0.08, -0.95], material: 'accent' },
  { size: [0.5, 0.16, 2.3], at: [0, -0.62, -1.1], material: 'metal' },
  { size: [0.16, 0.14, 1.1], at: [0, 0.46, 0.7], material: 'metal' },
  { size: [0.16, 0.14, 1.1], at: [0, -0.46, 0.7], material: 'metal' },
  { size: [0.18, 0.06, 0.16], at: [0, 0.37, 1.18], material: 'accent' },
  { size: [0.18, 0.06, 0.16], at: [0, -0.37, 1.18], material: 'accent' },
  { size: [0.4, 0.4, 0.14], at: [0, 0, 0.27], material: 'metal' },
  { size: [0.26, 0.26, 0.08], at: [0, 0, 0.37], material: 'accent' },
  { size: [0.26, 1.12, 0.4], at: [0, -1.05, -1.75], material: 'grip', tilt: 0.4 },
  { size: [0.08, 0.5, 0.08], at: [0, -0.92, -1.05], material: 'metal', tilt: 0.2 },
];
/** Hook sights on top, at these Z positions. */
const PLAYER_GRAPPLE_GUN_SIGHTS = [-1.95, -0.25] as const;
/** Muzzle (between the prong tips) in design units. */
const PLAYER_GRAPPLE_GUN_MUZZLE_AT = new THREE.Vector3(0, 0, 1.25);
/** Where the hand holds the grip in design units (the gun's origin). */
const PLAYER_GRAPPLE_GUN_HOLD = new THREE.Vector3(0, -0.95, -1.7);

let playerGrappleGunParts: {
  box: THREE.BoxGeometry;
  sight: THREE.TorusGeometry;
  materials: Record<Exclude<PlayerGrappleGunBox['material'], 'accent'>, THREE.Material>;
  accents: Map<number, THREE.Material>;
} | null = null;

/**
 * Returns the shared geometry and materials of the gun: graphite body, gunmetal
 * parts and a dark rubber grip (the glowing accents, one per player color, are
 * made on first use).
 *
 * @returns Parts.
 */
function playerGrappleGunShared(): NonNullable<typeof playerGrappleGunParts> {
  playerGrappleGunParts ??= {
    box: new THREE.BoxGeometry(1, 1, 1),
    sight: new THREE.TorusGeometry(0.16, 0.045, 6, 12, Math.PI * 1.3),
    materials: {
      body: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.55, roughness: 0.45 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0.8, roughness: 0.35 }),
      grip: new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9 }),
    },
    accents: new Map(),
  };
  return playerGrappleGunParts;
}

/**
 * Builds the grapple gun at its true size: its origin is where the hand holds
 * the grip, the barrel points along -Z and the muzzle marker sits between the
 * prong tips. Geometry and materials are shared (nothing to free), and it never
 * catches a raycast.
 *
 * @param color Player color of the glowing accents.
 * @returns Gun.
 */
export function playerGrappleGun(color: number): THREE.Group {
  const { box, sight, materials, accents } = playerGrappleGunShared();
  let accent = accents.get(color);
  if (!accent) accents.set(color, (accent = new THREE.MeshBasicMaterial({ color })));
  const design = new THREE.Group();
  const add = (mesh: THREE.Mesh) => {
    mesh.raycast = () => undefined;
    design.add(mesh);
  };
  PLAYER_GRAPPLE_GUN_BOXES.forEach((part) => {
    const mesh = new THREE.Mesh(box, part.material === 'accent' ? accent : materials[part.material]);
    mesh.scale.set(...part.size);
    mesh.position.set(...part.at);
    mesh.rotation.x = part.tilt ?? 0;
    add(mesh);
  });
  PLAYER_GRAPPLE_GUN_SIGHTS.forEach((z) => {
    const mesh = new THREE.Mesh(sight, materials.metal);
    mesh.position.set(0, 0.62, z);
    mesh.rotation.z = -0.47;
    add(mesh);
  });
  const muzzle = new THREE.Object3D();
  muzzle.name = PLAYER_GRAPPLE_GUN_MUZZLE;
  muzzle.position.copy(PLAYER_GRAPPLE_GUN_MUZZLE_AT);
  design.add(muzzle);
  design.position.copy(PLAYER_GRAPPLE_GUN_HOLD).multiplyScalar(-1);
  const scaled = new THREE.Group();
  scaled.scale.setScalar(PLAYER_GRAPPLE_GUN_SCALE);
  scaled.rotation.y = Math.PI;
  scaled.add(design);
  const gun = new THREE.Group();
  gun.name = 'Grapple gun';
  gun.add(scaled);
  return gun;
}

/**
 * Copies where the beam leaves a gun (its muzzle) in world space.
 *
 * @param gun Gun made by playerGrappleGun (its world matrix up to date).
 * @param target Destination.
 * @returns The target, or null when it is not a gun.
 */
export function playerGrappleGunMuzzle(gun: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 | null {
  return gun.getObjectByName(PLAYER_GRAPPLE_GUN_MUZZLE)?.getWorldPosition(target) ?? null;
}
