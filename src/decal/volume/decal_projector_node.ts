import type * as THREE from 'three';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import {
  MODIFIER_STACK_DECAL_KEYS,
  MODIFIER_STACK_KIND_DECAL,
} from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';
import type { DecalProjectorMode } from '@/decal/settings/decal_projector_settings.js';

/** Box size of a new decal projector: a square image, half as deep. */
const DECAL_PROJECTOR_NODE_SIZE = { width: 2, depth: 1 } as const;

/**
 * Creates a decal projector: a modifier volume with the decal role whose stack
 * starts with the Decal modifier. Its local -Y axis is the projection
 * direction; local X and -Z span the image.
 *
 * @param mode Presentation mode of the new projector.
 * @returns Named projector mesh.
 */
export function decalProjectorNodeCreate(mode: DecalProjectorMode): THREE.Mesh {
  const entry = modifierStackEntryCreate(MODIFIER_STACK_KIND_DECAL, []);
  entry.parameters = { ...entry.parameters, [MODIFIER_STACK_DECAL_KEYS.mode]: mode };
  entry.expanded = true;
  const mesh = ModifierVolume.create({ role: 'decal', modifiers: [entry] });
  mesh.scale.set(DECAL_PROJECTOR_NODE_SIZE.width, DECAL_PROJECTOR_NODE_SIZE.depth, DECAL_PROJECTOR_NODE_SIZE.width);
  mesh.name = hierarchyNameAllocator.allocate(mode === 'surfaceMesh' ? 'Decal Surface Mesh' : 'Decal Projector');
  return mesh;
}
