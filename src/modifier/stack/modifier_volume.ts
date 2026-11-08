import { detectGeometrySourceFromInstance, setGeometrySource } from '@/texture/uv/geometry_source.js';
import * as THREE from 'three';
import { SKIP_FACE_PICK_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { MODIFIER_STACK_USERDATA_KEY } from '@/modifier/volume/modifier_volume_record.js';
import {
  MODIFIER_VOLUME_BEVEL_EDGE_KEY,
  MODIFIER_VOLUME_BEVEL_USERDATA_KEY,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import type { ModifierStackSettings } from './modifier_stack_types.js';
import { modifierStackSettingsNormalize } from './modifier_stack_settings.js';

/** Translucent box color shared by every modifier volume. */
const MODIFIER_VOLUME_COLOR = 0xe67e22;

/** Translucent box color of generator nodes, so they read apart from volumes. */
export const MODIFIER_GENERATOR_COLOR = 0x26b5a5;

/**
 * The single scene volume type. Its box selects authored brushes and its
 * ordered modifier stack turns them, or nothing, into derived brushes.
 */
export class ModifierVolume {
  /**
   * Returns whether an object is a modifier volume.
   *
   * @param object Candidate object.
   * @returns True when the object carries a modifier stack.
   */
  static isVolume(object: THREE.Object3D): boolean {
    return (
      object.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] === true &&
      object.userData[MODIFIER_STACK_USERDATA_KEY] !== undefined
    );
  }

  /**
   * Returns whether an object is a generator node: a box that builds pieces
   * with its own stack and captures nothing.
   *
   * @param object Candidate object.
   * @returns True for generator nodes.
   */
  static isGenerator(object: THREE.Object3D): boolean {
    if (!ModifierVolume.isVolume(object)) return false;
    return (object.userData[MODIFIER_STACK_USERDATA_KEY] as Partial<ModifierStackSettings>).role === 'generator';
  }

  /**
   * Reads a detached, normalized copy of the stack.
   *
   * @param volume Modifier volume.
   * @returns Stack settings.
   */
  static read(volume: THREE.Object3D): ModifierStackSettings {
    const stored = volume.userData[MODIFIER_STACK_USERDATA_KEY] as Partial<ModifierStackSettings> | undefined;
    return modifierStackSettingsNormalize(structuredClone(stored ?? {}));
  }

  /**
   * Stores normalized stack settings.
   *
   * @param volume Modifier volume.
   * @param settings New settings.
   */
  static write(volume: THREE.Object3D, settings: Partial<ModifierStackSettings>): void {
    volume.userData[MODIFIER_STACK_USERDATA_KEY] = modifierStackSettingsNormalize(structuredClone(settings));
  }

  /**
   * Creates a volume around box geometry with its see-through material and
   * outline.
   *
   * @param settings Initial stack.
   * @param geometry Box geometry; a unit box when omitted.
   * @returns Unnamed volume mesh.
   */
  static create(settings: Partial<ModifierStackSettings>, geometry?: THREE.BufferGeometry): THREE.Mesh {
    const color = settings.role === 'generator' ? MODIFIER_GENERATOR_COLOR : MODIFIER_VOLUME_COLOR;
    const mesh = new THREE.Mesh(geometry ?? new THREE.BoxGeometry(1, 1, 1), ModifierVolume.createMaterial(color));
    const source = detectGeometrySourceFromInstance(mesh.geometry);
    if (source) setGeometrySource(mesh, source);
    mesh.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] = true;
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
    ModifierVolume.write(mesh, settings);
    ModifierVolume.outlineAdd(mesh, color);
    return mesh;
  }

  /**
   * Copies the stack onto a duplicated mesh.
   *
   * @param source Source volume.
   * @param clone Duplicate mesh.
   */
  static copyOntoClone(source: THREE.Object3D, clone: THREE.Object3D): void {
    if (!ModifierVolume.isVolume(source)) return;
    clone.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] = true;
    ModifierVolume.write(clone, ModifierVolume.read(source));
  }

  /**
   * Creates the translucent box material.
   *
   * @param color Box color.
   * @returns Basic material.
   */
  private static createMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Adds the non-pickable outline child.
   *
   * @param mesh Volume mesh.
   * @param color Outline color.
   */
  private static outlineAdd(mesh: THREE.Mesh, color: number): void {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color }));
    line.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    line.raycast = () => undefined;
    mesh.add(line);
  }
}

/**
 * Finds the top of an object's parent chain.
 *
 * @param object Start object.
 * @returns Root object.
 */
export function modifierVolumeSceneRoot(object: THREE.Object3D): THREE.Object3D {
  let root = object;
  while (root.parent) root = root.parent;
  return root;
}

/**
 * Lists attached, visible, enabled volumes in a deterministic order. Generator
 * nodes are not volumes here: they capture nothing.
 *
 * @param root Scene root.
 * @returns Volumes sorted by uuid.
 */
export function modifierVolumesActive(root: THREE.Object3D): THREE.Object3D[] {
  return modifierStackNodesActive(root).filter((object) => !ModifierVolume.isGenerator(object));
}

/**
 * Lists attached, visible, enabled generator nodes in scene order.
 *
 * @param root Scene or solid root.
 * @returns Generator nodes.
 */
export function modifierGeneratorsActive(root: THREE.Object3D): THREE.Object3D[] {
  const output: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (ModifierVolume.isGenerator(object) && modifierVolumeVisible(object) && ModifierVolume.read(object).enabled)
      output.push(object);
  });
  return output;
}

/**
 * Lists attached, visible, enabled volumes and generator nodes.
 *
 * @param root Scene root.
 * @returns Stack nodes sorted by uuid.
 */
export function modifierStackNodesActive(root: THREE.Object3D): THREE.Object3D[] {
  const output: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (ModifierVolume.isVolume(object) && modifierVolumeVisible(object) && ModifierVolume.read(object).enabled)
      output.push(object);
  });
  return output.sort((left, right) => left.uuid.localeCompare(right.uuid));
}

/**
 * Lists every attached volume, enabled or not.
 *
 * @param root Scene root.
 * @returns Volumes in traversal order.
 */
export function modifierVolumesAll(root: THREE.Object3D): THREE.Object3D[] {
  const output: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (ModifierVolume.isVolume(object)) output.push(object);
  });
  return output;
}

/**
 * Returns whether the volume and all its parents are visible.
 *
 * @param object Volume.
 * @returns True when nothing in the chain is hidden.
 */
export function modifierVolumeVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
