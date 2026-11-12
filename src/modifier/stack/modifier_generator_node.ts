import type * as THREE from 'three';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { modifierStackKindFind } from './modifier_stack_catalog.js';
import { ModifierVolume } from './modifier_volume.js';
import { modifierVolumeTemplateEntries } from './modifier_volume_templates.js';

/** Generator kinds offered as standalone nodes, in menu order. */
export const MODIFIER_GENERATOR_NODE_KINDS: readonly string[] = ['column', 'stairs', 'arch'];

/** Box size of a new generator node, per kind, in meters. */
const MODIFIER_GENERATOR_NODE_SIZES: Readonly<Record<string, readonly [number, number, number]>> = {
  column: [1, 3, 1],
  stairs: [2, 2, 3],
  arch: [3, 3, 1],
};

/**
 * Creates a generator node: a box that builds the kind's pieces and owns its
 * own modifier stack. It captures nothing; volumes around it still affect it.
 *
 * @param kind Generator kind id.
 * @returns Named node mesh.
 */
export function modifierGeneratorNodeCreate(kind: string): THREE.Mesh {
  const mesh = ModifierVolume.create({ role: 'generator', modifiers: modifierVolumeTemplateEntries([kind]) });
  const [x, y, z] = MODIFIER_GENERATOR_NODE_SIZES[kind] ?? [1, 1, 1];
  mesh.scale.set(x, y, z);
  mesh.name = hierarchyNameAllocator.allocate(modifierStackKindFind(kind)?.label ?? 'Generator');
  return mesh;
}

/**
 * Returns the kind a generator node builds: its first modifier.
 *
 * @param node Generator node.
 * @returns Kind id, or empty.
 */
export function modifierGeneratorNodeKind(node: THREE.Object3D): string {
  return ModifierVolume.read(node).modifiers[0]?.kind ?? '';
}

/**
 * Poses a new generator node on the spot a new box brush of the given size
 * would stand on, so its box rests on the same floor.
 *
 * @param node Generator node.
 * @param root Solid model root the spot is local to.
 * @param parent Node the generator is inserted under.
 * @param spot Model-local pose of the new box brush.
 * @param spot.offset Model-local centre.
 * @param spot.rotation Model-local rotation.
 * @param brushSize Box brush edge length.
 */
export function modifierGeneratorNodePlace(
  node: THREE.Object3D,
  root: THREE.Object3D,
  parent: THREE.Object3D,
  spot: { offset: THREE.Vector3; rotation: THREE.Euler },
  brushSize: number,
): void {
  const local = spot.offset.clone();
  local.y += (node.scale.y - brushSize) / 2;
  root.updateMatrixWorld(true);
  node.position.copy(parent.worldToLocal(root.localToWorld(local)));
  node.rotation.copy(spot.rotation);
}
