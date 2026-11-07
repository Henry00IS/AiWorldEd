import type { ModifierStackKind } from './kinds/modifier_stack_kind.js';
import { ModifierStackKindBevel } from './kinds/bevel/modifier_stack_kind_bevel.js';
import { ModifierStackKindArrayLinear } from './kinds/array/modifier_stack_kind_array_linear.js';
import { ModifierStackKindArrayRadial } from './kinds/array/modifier_stack_kind_array_radial.js';
import { ModifierStackKindArrayTransform } from './kinds/array/modifier_stack_kind_array_transform.js';
import { ModifierStackKindArrayMirror } from './kinds/array/modifier_stack_kind_array_mirror.js';
import { ModifierStackKindStairs } from './kinds/generator/modifier_stack_kind_stairs.js';
import { ModifierStackKindArch } from './kinds/generator/modifier_stack_kind_arch.js';
import { ModifierStackKindColumn } from './kinds/generator/modifier_stack_kind_column.js';

/** Every installed modifier kind, in add-menu order. */
export const modifierStackKinds: readonly ModifierStackKind[] = [
  new ModifierStackKindStairs(),
  new ModifierStackKindArch(),
  new ModifierStackKindColumn(),
  new ModifierStackKindArrayLinear(),
  new ModifierStackKindArrayRadial(),
  new ModifierStackKindArrayTransform(),
  new ModifierStackKindArrayMirror(),
  new ModifierStackKindBevel(),
];

/**
 * Finds an installed kind.
 *
 * @param id Persisted kind id.
 * @returns Kind, or undefined when not installed.
 */
export function modifierStackKindFind(id: string): ModifierStackKind | undefined {
  return modifierStackKinds.find((kind) => kind.id === id);
}
