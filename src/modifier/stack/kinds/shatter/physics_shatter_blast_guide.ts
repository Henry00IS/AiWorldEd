import * as THREE from 'three';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { ModifierVolumeDirectionArrow } from '@/modifier/volume/modifier_volume_direction_arrow.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { physicsShatterBlastRead } from './physics_shatter_settings.js';

/** Blast guide color: hot red, apart from the orange volume box. */
const PHYSICS_SHATTER_BLAST_COLOR = 0xff4a2a;

/** Line segments of the blast radius rings. */
const PHYSICS_SHATTER_RING_SEGMENTS = 48;

/**
 * Builds the blast guides: an arrow whose tip touches the impact point and
 * points along the blast, and three rings showing the blast radius.
 *
 * @param volume Owning volume.
 * @param parameters Normalized parameters.
 * @returns Guides in the volume's local space.
 */
export function physicsShatterBlastHelpers(
  volume: THREE.Object3D,
  parameters: Record<string, unknown>,
): THREE.Object3D[] {
  const blast = physicsShatterBlastRead(parameters);
  volume.updateWorldMatrix(true, false);
  const frameToLocal = volume.matrixWorld.clone().invert().multiply(modifierStackFrame(volume, 'volume'));
  const arrow = ModifierVolumeDirectionArrow.create(PHYSICS_SHATTER_BLAST_COLOR, 'Blast Direction');
  const length = Math.max(0.5, blast.radius);
  arrow.matrixAutoUpdate = false;
  arrow.matrix.copy(
    frameToLocal.clone().multiply(ModifierVolumeDirectionArrow.placement(blast.impactPoint, blast.direction, length)),
  );
  const rings = physicsShatterRadiusRings(blast.impactPoint, blast.radius);
  rings.matrixAutoUpdate = false;
  rings.matrix.copy(frameToLocal);
  return [arrow, rings];
}

/**
 * Builds three axis rings of a sphere.
 *
 * @param centre Sphere centre in the frame.
 * @param radius Sphere radius.
 * @returns Ring lines in frame coordinates.
 */
function physicsShatterRadiusRings(centre: THREE.Vector3, radius: number): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (const [first, second] of [
    [0, 1],
    [1, 2],
    [0, 2],
  ] as const) {
    for (let step = 0; step < PHYSICS_SHATTER_RING_SEGMENTS; step++) {
      points.push(physicsShatterRingPoint(centre, radius, first, second, step));
      points.push(physicsShatterRingPoint(centre, radius, first, second, step + 1));
    }
  }
  const material = new THREE.LineBasicMaterial({
    color: PHYSICS_SHATTER_BLAST_COLOR,
    transparent: true,
    opacity: 0.45,
  });
  const rings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material);
  rings.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
  rings.raycast = () => undefined;
  return rings;
}

/**
 * Returns one point of an axis ring.
 *
 * @param centre Ring centre.
 * @param radius Ring radius.
 * @param first Axis index of the cosine term.
 * @param second Axis index of the sine term.
 * @param step Segment index around the ring.
 * @returns Ring point.
 */
function physicsShatterRingPoint(
  centre: THREE.Vector3,
  radius: number,
  first: number,
  second: number,
  step: number,
): THREE.Vector3 {
  const angle = (step / PHYSICS_SHATTER_RING_SEGMENTS) * Math.PI * 2;
  const point = centre.clone();
  point.setComponent(first, point.getComponent(first) + Math.cos(angle) * radius);
  return point.setComponent(second, point.getComponent(second) + Math.sin(angle) * radius);
}
