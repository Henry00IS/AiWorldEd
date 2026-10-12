import * as THREE from 'three';
import { SKIP_FACE_PICK_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { ModifierVolumeBevelRegistry } from './modifier_volume_bevel_registry.js';
import {
  MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE,
  MODIFIER_VOLUME_BEVEL_DISTANCE_KEY,
  MODIFIER_VOLUME_BEVEL_EDGE_KEY,
  MODIFIER_VOLUME_BEVEL_USERDATA_KEY,
} from './modifier_volume_bevel_keys.js';

const VOLUME_COLOR = 0xe67e22;

/**
 * Scene object that chamfers brush edges inside its box. The box is ordinary
 * transformable geometry; derived brush faces are never stored on it.
 */
export class ModifierVolumeBevel {
  /**
   * Returns whether an object is a bevel volume.
   *
   * @param object Candidate object.
   * @returns True when the bevel-volume flag is set.
   */
  static isVolume(object: THREE.Object3D): boolean {
    return object.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] === true;
  }

  /**
   * Reads the chamfer distance, falling back to the default.
   *
   * @param volume Bevel volume.
   * @returns World-space distance, never negative.
   */
  static readDistance(volume: THREE.Object3D): number {
    const stored = volume.userData[MODIFIER_VOLUME_BEVEL_DISTANCE_KEY];
    if (typeof stored !== 'number' || !Number.isFinite(stored)) {
      return MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE;
    }
    return Math.max(0, stored);
  }

  /**
   * Writes the chamfer distance onto the volume.
   *
   * @param volume Bevel volume.
   * @param distance World-space distance.
   */
  static writeDistance(volume: THREE.Object3D, distance: number): void {
    const safe = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    volume.userData[MODIFIER_VOLUME_BEVEL_DISTANCE_KEY] = safe;
  }

  /**
   * Creates a unit box volume at the origin.
   *
   * @returns Selectable bevel volume mesh.
   */
  static create(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ModifierVolumeBevel.createMaterial());
    mesh.name = hierarchyNameAllocator.allocate('Bevel Volume');
    ModifierVolumeBevel.stamp(mesh, MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE);
    return mesh;
  }

  /**
   * Marks a mesh as a bevel volume and ensures its outline.
   *
   * @param mesh Volume mesh.
   * @param distance Chamfer distance.
   */
  static stamp(mesh: THREE.Mesh, distance: number): void {
    mesh.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] = true;
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
    ModifierVolumeBevel.writeDistance(mesh, distance);
    ModifierVolumeBevel.ensureOutline(mesh);
    ModifierVolumeBevelRegistry.register(mesh);
  }

  /**
   * Copies bevel identity onto a duplicated mesh.
   *
   * @param source Source volume.
   * @param clone Duplicated mesh.
   */
  static copyOntoClone(source: THREE.Object3D, clone: THREE.Mesh): void {
    if (!ModifierVolumeBevel.isVolume(source)) return;
    ModifierVolumeBevel.stamp(clone, ModifierVolumeBevel.readDistance(source));
  }

  /**
   * Creates the translucent volume material.
   *
   * @returns Basic material.
   */
  private static createMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: VOLUME_COLOR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Adds an outline child when the volume does not already have one.
   *
   * @param mesh Volume mesh.
   */
  private static ensureOutline(mesh: THREE.Mesh): void {
    if (ModifierVolumeBevel.hasOutline(mesh)) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: VOLUME_COLOR }));
    line.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    line.raycast = () => undefined;
    mesh.add(line);
  }

  /**
   * Returns whether the outline child is already present.
   *
   * @param mesh Volume mesh.
   * @returns True when an outline child exists.
   */
  private static hasOutline(mesh: THREE.Mesh): boolean {
    return mesh.children.some((child) => child.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] === true);
  }
}
