import * as THREE from 'three';
import { generatorKindFind } from './modifier_generator_catalog.js';
import { generatorSettingsNormalize } from './modifier_generator_settings.js';
import type { GeneratorSettings } from './modifier_generator_types.js';

/** Selectable authored box that captures convex brush operands. */
export class ModifierGeneratorVolume {
  /** Checks the generator marker. @param object Candidate. */
  static isVolume(object: THREE.Object3D): boolean {
    return object.userData['modifierGenerator'] !== undefined;
  }
  /** Reads detached normalized settings. @param object Authored volume. */
  static read(object: THREE.Object3D): GeneratorSettings {
    return generatorSettingsNormalize(object.userData['modifierGenerator'] as Partial<GeneratorSettings> | undefined);
  }
  /**
   * Writes plain authored state. @param object Volume. @param settings New
   * settings.
   */
  static write(object: THREE.Object3D, settings: Partial<GeneratorSettings>): void {
    object.userData['modifierGenerator'] = generatorSettingsNormalize(settings);
  }
  /**
   * Creates the translucent selector. @param kind Installed or preserved kind
   * ID. @param geometry Optional saved box geometry.
   */
  static create(kind: string, geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1)): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      color: 0x40a9d0,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = generatorKindFind(kind)?.label ?? 'Unavailable Generator';
    this.write(mesh, { kind });
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x40a9d0 }),
    );
    outline.userData['isModifierVolumeEdge'] = true;
    mesh.add(outline);
    return mesh;
  }
}
/** Finds the scene anchor. @param object Starting node. */
export function generatorSceneRoot(object: THREE.Object3D): THREE.Object3D {
  let root = object;
  while (root.parent) root = root.parent;
  return root;
}
/**
 * Lists only attached enabled selectors, in deterministic order. @param root
 * Scene anchor.
 */
export function generatorVolumes(root: THREE.Object3D): THREE.Object3D[] {
  const output: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (ModifierGeneratorVolume.isVolume(object) && object.visible && ModifierGeneratorVolume.read(object).enabled)
      output.push(object);
  });
  return output.sort((a, b) => a.uuid.localeCompare(b.uuid));
}
