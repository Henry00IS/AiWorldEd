import type * as THREE from 'three';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { ModifierVolume } from './modifier_volume.js';
import { modifierStackEntryCreate } from './modifier_stack_settings.js';
import type { ModifierStackEntry } from './modifier_stack_types.js';

/** A top-menu preset: one modifier volume with initial modifiers. */
export interface ModifierVolumeTemplate {
  /** Template id. */
  id: string;
  /** Menu label and base object name. */
  label: string;
  /** Kinds added in order. */
  kinds: readonly string[];
}

/** Presets offered in the Add menu, in menu order. */
export const modifierVolumeTemplates: readonly ModifierVolumeTemplate[] = [
  { id: 'empty', label: 'Modifier Volume', kinds: [] },
  { id: 'bevel', label: 'Bevel Volume', kinds: ['bevel'] },
  { id: 'linear', label: 'Array Volume', kinds: ['linear'] },
  { id: 'radial', label: 'Radial Array Volume', kinds: ['radial'] },
  { id: 'transform', label: 'Transform Array Volume', kinds: ['transform'] },
  { id: 'mirror', label: 'Mirror Volume', kinds: ['mirror'] },
  { id: 'shear', label: 'Shear Volume', kinds: ['shear'] },
  { id: 'stairs', label: 'Stairs Volume', kinds: ['stairs'] },
  { id: 'arch', label: 'Arch Volume', kinds: ['arch'] },
  { id: 'column', label: 'Column Volume', kinds: ['column'] },
];

/**
 * Builds the modifier list of a template.
 *
 * @param kinds Kinds in order.
 * @param fresh True uses new-modifier values; false keeps legacy defaults.
 * @returns Entries with unique ids.
 */
export function modifierVolumeTemplateEntries(kinds: readonly string[], fresh = true): ModifierStackEntry[] {
  const entries: ModifierStackEntry[] = [];
  for (const kind of kinds) entries.push(modifierStackEntryCreate(kind, entries, fresh));
  return entries;
}

/**
 * Creates a named modifier volume from a template.
 *
 * @param templateId Template id; unknown ids give an empty volume.
 * @param geometry Optional box geometry.
 * @returns Volume mesh.
 */
export function modifierVolumeTemplateCreate(templateId: string, geometry?: THREE.BufferGeometry): THREE.Mesh {
  const template = modifierVolumeTemplates.find((entry) => entry.id === templateId) ?? modifierVolumeTemplates[0];
  const mesh = ModifierVolume.create({ modifiers: modifierVolumeTemplateEntries(template?.kinds ?? []) }, geometry);
  mesh.name = hierarchyNameAllocator.allocate(template?.label ?? 'Modifier Volume');
  return mesh;
}
