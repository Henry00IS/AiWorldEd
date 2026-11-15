import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import type { ModifierStackSettings } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackPatch } from '@/modifier/stack/modifier_stack_operations.js';
import { modifierStackOwnerEncode } from '@/modifier/stack/owner/modifier_stack_owner.js';

/**
 * Reads the stack of a volume, or of a brush or group that owns one.
 *
 * @param owner Volume, brush or group.
 * @returns Stack, or undefined when the object has none.
 */
function physicsShatterCommitStackRead(owner: THREE.Object3D): ModifierStackSettings | undefined {
  return ModifierVolume.isVolume(owner) ? ModifierVolume.read(owner) : modifierStackOwnerEncode(owner);
}

/**
 * Changes some parameters of one modifier as a single undoable stack edit.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Modifier id.
 * @param patch Parameters to change.
 * @param commandStack Undo stack, or null to apply directly.
 * @returns False when the modifier no longer exists.
 */
export function physicsShatterCommitParameters(
  owner: THREE.Object3D,
  stepId: string,
  patch: Record<string, unknown>,
  commandStack: CommandStack | null,
): boolean {
  const before = physicsShatterCommitStackRead(owner);
  const entry = before?.modifiers.find((candidate) => candidate.id === stepId);
  if (!before || !entry) return false;
  const after = modifierStackPatch(before, stepId, { parameters: { ...entry.parameters, ...patch } });
  const command = new CommandModifierStackSet(owner, before, after);
  if (commandStack) commandStack.push(command);
  else command.execute();
  return true;
}
