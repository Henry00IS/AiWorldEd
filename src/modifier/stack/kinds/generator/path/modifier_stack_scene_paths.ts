import * as THREE from 'three';
import {
  pathAssetEncode,
  type PathAsset,
  type PathAssetPoint,
  type PathAssetSegment,
} from '@/path/model/path_asset.js';
import { pathReferenceRead } from '@/path/model/path_reference.js';
import { ModifierVolume, modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import {
  MODIFIER_STACK_PATH_KIND,
  modifierStackPathObjectAsset,
  modifierStackPathObjectFrame,
} from './modifier_stack_path_object.js';

/**
 * Steps coordinates of a followed path are rounded to, past floating-point
 * noise.
 */
const MODIFIER_STACK_SCENE_PATH_STEPS = 1e6;

/** Script inputs with every followed Path object's path filled in. */
export interface ModifierStackScenePathsLinked {
  /** Input values, a followed path as the shape it has in script coordinates. */
  inputs: Record<string, string>;
  /** Names followed that no Path object in the scene has. */
  missing: string[];
}

/**
 * Lists the Path objects in a scene, shown or hidden, in scene order.
 *
 * @param sceneRoot Scene root.
 * @returns Path objects.
 */
export function modifierStackScenePathObjects(sceneRoot: THREE.Object3D): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  sceneRoot.traverse((object) => {
    if (
      ModifierVolume.isGenerator(object) &&
      ModifierVolume.read(object).modifiers[0]?.kind === MODIFIER_STACK_PATH_KIND
    )
      found.push(object);
  });
  return found;
}

/**
 * Lists the names of the Path objects in a scene, each once, for pickers.
 *
 * @param member Any object of the scene.
 * @returns Names in scene order.
 */
export function modifierStackScenePathNames(member: THREE.Object3D): string[] {
  return [...new Set(modifierStackScenePathObjects(modifierVolumeSceneRoot(member)).map((node) => node.name))];
}

/**
 * Fills in the Path inputs of a script that follow a Path object: each becomes
 * that object's path as it lies in the script's coordinates, or its stored
 * shape while no Path object has the name.
 *
 * @param owner Stack owner whose scene is searched.
 * @param inputs Stored input values by name.
 * @param scriptToWorld Matrix from script coordinates to the world.
 * @returns Inputs to run the script with, and the names not found.
 */
export function modifierStackScenePathsLink(
  owner: THREE.Object3D,
  inputs: Readonly<Record<string, string>>,
  scriptToWorld: THREE.Matrix4,
): ModifierStackScenePathsLinked {
  const objects = modifierStackScenePathObjects(modifierVolumeSceneRoot(owner));
  const worldToScript = scriptToWorld.clone().invert();
  const linked: ModifierStackScenePathsLinked = { inputs: { ...inputs }, missing: [] };
  for (const [name, text] of Object.entries(inputs)) {
    const reference = pathReferenceRead(text);
    if (!reference) continue;
    const node = objects.find((each) => each.name === reference.scene);
    if (!node) linked.missing.push(reference.scene);
    const path = node ? modifierStackScenePathIn(node, worldToScript) : reference.fallback;
    if (path) linked.inputs[name] = pathAssetEncode(path);
  }
  return linked;
}

/**
 * Returns text that changes whenever a Path object a script follows moves,
 * turns or changes its path, or appears or goes, for the evaluation cache.
 *
 * @param owner Stack owner whose scene is searched.
 * @param inputs Stored input values by name.
 * @returns Key; empty when no input follows a Path object.
 */
export function modifierStackScenePathsKey(owner: THREE.Object3D, inputs: Readonly<Record<string, unknown>>): string {
  const names = Object.values(inputs).flatMap((text) => {
    const reference = typeof text === 'string' ? pathReferenceRead(text) : null;
    return reference ? [reference.scene] : [];
  });
  if (names.length === 0) return '';
  const objects = modifierStackScenePathObjects(modifierVolumeSceneRoot(owner));
  return JSON.stringify(
    names.map((name) => {
      const node = objects.find((each) => each.name === name);
      return node ? [name, node.matrixWorld.elements, ModifierVolume.read(node).modifiers[0]?.parameters] : [name];
    }),
  );
}

/**
 * Returns whether any stored input follows a Path object.
 *
 * @param inputs Stored input values by name.
 * @returns True when one does.
 */
export function modifierStackScenePathsFollowed(inputs: Readonly<Record<string, unknown>>): boolean {
  return Object.values(inputs).some((text) => typeof text === 'string' && pathReferenceRead(text) !== null);
}

/**
 * Returns a Path object's path in other coordinates: points move along, and
 * handle offsets and arc axes turn along.
 *
 * @param node Path object.
 * @param worldToTarget Matrix from the world to the coordinates wanted.
 * @returns Path.
 */
function modifierStackScenePathIn(node: THREE.Object3D, worldToTarget: THREE.Matrix4): PathAsset {
  const path = modifierStackPathObjectAsset(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const matrix = worldToTarget.clone().multiply(modifierStackPathObjectFrame(node));
  const turn = new THREE.Matrix3().setFromMatrix4(matrix);
  return {
    points: path.points.map((point) => modifierStackScenePathRound(new THREE.Vector3(...point).applyMatrix4(matrix))),
    segments: path.segments.map((segment) => modifierStackScenePathSegmentTurn(segment, turn)),
    closed: path.closed,
  };
}

/**
 * Turns the handle offsets and arc axis of a stretch.
 *
 * @param segment Stretch.
 * @param turn Rotation.
 * @returns Turned stretch.
 */
function modifierStackScenePathSegmentTurn(segment: PathAssetSegment, turn: THREE.Matrix3): PathAssetSegment {
  const turned: Record<string, unknown> = { ...segment };
  for (const key of ['control', 'out', 'in', 'axis'] as const) {
    const value = segment[key];
    if (value) turned[key] = modifierStackScenePathRound(new THREE.Vector3(...value).applyMatrix3(turn));
  }
  return turned as unknown as PathAssetSegment;
}

/**
 * Rounds a vector to a point, past floating-point noise.
 *
 * @param vector Vector.
 * @returns Point.
 */
function modifierStackScenePathRound(vector: THREE.Vector3): PathAssetPoint {
  const round = (value: number): number =>
    Math.round(value * MODIFIER_STACK_SCENE_PATH_STEPS) / MODIFIER_STACK_SCENE_PATH_STEPS + 0;
  return [round(vector.x), round(vector.y), round(vector.z)];
}
