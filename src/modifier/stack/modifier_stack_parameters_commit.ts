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
function modifierStackParametersStackRead(owner: THREE.Object3D): ModifierStackSettings | undefined {
  return ModifierVolume.isVolume(owner) ? ModifierVolume.read(owner) : modifierStackOwnerEncode(owner);
}

/**
 * Reads the stored parameters of one modifier.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Modifier id.
 * @returns Parameters, or undefined when the modifier no longer exists.
 */
export function modifierStackParametersRead(
  owner: THREE.Object3D,
  stepId: string,
): Record<string, unknown> | undefined {
  return modifierStackParametersStackRead(owner)?.modifiers.find((candidate) => candidate.id === stepId)?.parameters;
}

/**
 * Builds the command that merges a patch into one step's parameters, without
 * running it.
 *
 * @param owner Volume or stack owner.
 * @param stepId Modifier id.
 * @param patch Parameters to set.
 * @returns Command, or null when the step is gone.
 */
export function modifierStackParametersCommand(
  owner: THREE.Object3D,
  stepId: string,
  patch: Record<string, unknown>,
): CommandModifierStackSet | null {
  const before = modifierStackParametersStackRead(owner);
  const entry = before?.modifiers.find((candidate) => candidate.id === stepId);
  if (!before || !entry) return null;
  const after = modifierStackPatch(before, stepId, { parameters: { ...entry.parameters, ...patch } });
  return new CommandModifierStackSet(owner, before, after);
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
export function modifierStackParametersCommit(
  owner: THREE.Object3D,
  stepId: string,
  patch: Record<string, unknown>,
  commandStack: CommandStack | null,
): boolean {
  const command = modifierStackParametersCommand(owner, stepId, patch);
  if (!command) return false;
  if (commandStack) commandStack.push(command);
  else command.execute();
  return true;
}
