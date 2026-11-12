import type * as THREE from 'three';
import { ModifierVolume } from './modifier_volume.js';
import { modifierStackKindFind } from './modifier_stack_catalog.js';
import type { ModifierStackSettings } from './modifier_stack_types.js';

/**
 * Returns whether a volume can change shapes: it has no enabled modifiers yet,
 * or at least one enabled modifier that changes geometry. Volumes holding only
 * surface layers such as decals capture nothing.
 *
 * @param volume Modifier volume.
 * @returns True when the volume takes part in the CSG.
 */
export function modifierVolumeChangesGeometry(volume: THREE.Object3D): boolean {
  return modifierStackSettingsChangeGeometry(ModifierVolume.read(volume));
}

/**
 * Returns whether a stack can change shapes; see
 * {@link modifierVolumeChangesGeometry}.
 *
 * @param settings Stack settings.
 * @returns True when the stack takes part in the CSG.
 */
export function modifierStackSettingsChangeGeometry(settings: ModifierStackSettings): boolean {
  const enabled = settings.modifiers.filter((step) => step.enabled);
  return enabled.length === 0 || enabled.some((step) => modifierStackKindFind(step.kind)?.changesGeometry ?? true);
}
