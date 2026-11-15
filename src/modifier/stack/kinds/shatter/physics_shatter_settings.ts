import * as THREE from 'three';
import type {
  PhysicsShatterAxis,
  PhysicsShatterCracks,
  PhysicsShatterMode,
  PhysicsShatterSettings,
} from './fracture/physics_shatter_types.js';
import { PHYSICS_SHATTER_MATERIALS } from './fracture/physics_shatter_materials.js';
import { PHYSICS_SHATTER_PATTERNS } from './fracture/physics_shatter_patterns.js';

/**
 * Reads a choice parameter.
 *
 * @param value Stored value.
 * @param allowed Allowed values, the default first.
 * @returns The value when allowed, else the default.
 */
function physicsShatterChoice<T extends string>(value: unknown, allowed: readonly [T, ...T[]]): T {
  return allowed.find((entry) => entry === value) ?? allowed[0];
}

/** Blast settings the simulation reads, in the modifier frame. */
export interface PhysicsShatterBlastSettings {
  /** Impact point in the modifier frame. */
  impactPoint: THREE.Vector3;
  /** Unit direction the blast pushes. */
  direction: THREE.Vector3;
  /** How hard the blast throws the pieces. */
  strength: number;
  /** Reach of the blast in metres. */
  radius: number;
  /** Seconds to simulate. */
  duration: number;
}

/** Crack face texture settings. */
export interface PhysicsShatterInsideSettings {
  /** Texture id, or empty to use the broken brush's texture. */
  textureId: string;
  /**
   * 'world' lays the texture on each face; 'box' projects from the nearest
   * side.
   */
  projection: 'world' | 'box';
  /** Metres per tile along U. */
  scaleU: number;
  /** Metres per tile along V. */
  scaleV: number;
  /** Shift along U in metres. */
  offsetU: number;
  /** Shift along V in metres. */
  offsetV: number;
  /** Rotation in degrees. */
  rotation: number;
}

/**
 * Reads a finite number parameter.
 *
 * @param parameters Normalized parameters.
 * @param key Parameter key.
 * @param fallback Value for missing input.
 * @returns Number.
 */
function physicsShatterNumber(parameters: Record<string, unknown>, key: string, fallback: number): number {
  const value = parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads a vector stored as prefixX, prefixY and prefixZ.
 *
 * @param parameters Normalized parameters.
 * @param prefix Key stem.
 * @param fallback Default vector.
 * @returns Vector.
 */
function physicsShatterVector(
  parameters: Record<string, unknown>,
  prefix: string,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  return new THREE.Vector3(
    physicsShatterNumber(parameters, `${prefix}X`, fallback.x),
    physicsShatterNumber(parameters, `${prefix}Y`, fallback.y),
    physicsShatterNumber(parameters, `${prefix}Z`, fallback.z),
  );
}

/**
 * Reads the fracture settings of a Physics Shatter modifier as the rows store
 * them; the fracture applies the material preset itself
 * (physicsShatterMaterialApply).
 *
 * @param parameters Normalized parameters.
 * @returns Fracture settings in the modifier frame.
 */
export function physicsShatterSettingsRead(parameters: Record<string, unknown>): PhysicsShatterSettings {
  const number = (key: string, fallback: number): number => physicsShatterNumber(parameters, key, fallback);
  return {
    material: physicsShatterChoice(parameters['material'], PHYSICS_SHATTER_MATERIALS),
    mode: physicsShatterChoice<PhysicsShatterMode>(parameters['mode'], PHYSICS_SHATTER_PATTERNS),
    cracks: physicsShatterChoice<PhysicsShatterCracks>(parameters['cracks'], ['auto', '2d', '3d']),
    thicknessAxis: physicsShatterChoice<PhysicsShatterAxis>(parameters['thicknessAxis'], ['auto', 'x', 'y', 'z']),
    grainAxis: physicsShatterChoice<PhysicsShatterAxis>(parameters['grainAxis'], ['auto', 'x', 'y', 'z']),
    grainStretch: number('grainStretch', 1),
    radialSpokes: Math.round(number('radialSpokes', 10)),
    seed: Math.round(number('seed', 1)),
    crackSize: number('crackSize', 0.5),
    impactDetail: number('impactDetail', 0.5),
    impactPoint: physicsShatterVector(parameters, 'impact', new THREE.Vector3()),
    impactRadius: number('radius', 1.5),
    brickLength: number('brickLength', 0.4),
    brickHeight: number('brickHeight', 0.2),
    mortarGap: number('mortarGap', 0),
    brickJitter: number('brickJitter', 0),
    maxPieces: Math.round(number('maxPieces', 300)),
  };
}

/**
 * Reads the blast settings of a Physics Shatter modifier.
 *
 * @param parameters Normalized parameters.
 * @returns Blast settings in the modifier frame; the direction is unit length.
 */
export function physicsShatterBlastRead(parameters: Record<string, unknown>): PhysicsShatterBlastSettings {
  const direction = physicsShatterVector(parameters, 'direction', new THREE.Vector3(0, 0, -1));
  if (direction.lengthSq() < 1e-12) direction.set(0, 0, -1);
  return {
    impactPoint: physicsShatterVector(parameters, 'impact', new THREE.Vector3()),
    direction: direction.normalize(),
    strength: physicsShatterNumber(parameters, 'strength', 10),
    radius: physicsShatterNumber(parameters, 'radius', 1.5),
    duration: physicsShatterNumber(parameters, 'duration', 3),
  };
}

/**
 * Reads the crack face texture settings.
 *
 * @param parameters Normalized parameters.
 * @returns Inside settings.
 */
export function physicsShatterInsideRead(parameters: Record<string, unknown>): PhysicsShatterInsideSettings {
  const number = (key: string, fallback: number): number => physicsShatterNumber(parameters, key, fallback);
  return {
    textureId: typeof parameters['insideTexture'] === 'string' ? parameters['insideTexture'] : '',
    projection: parameters['insideProjection'] === 'box' ? 'box' : 'world',
    scaleU: number('insideScaleU', 1),
    scaleV: number('insideScaleV', 1),
    offsetU: number('insideOffsetU', 0),
    offsetV: number('insideOffsetV', 0),
    rotation: number('insideRotation', 0),
  };
}
