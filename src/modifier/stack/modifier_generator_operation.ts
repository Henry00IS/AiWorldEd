import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import { SolidOperation, solidOperationToggleAdditiveSubtractive } from '@/solid/types/solid_operation.js';
import { CommandModifierStackSet } from './command_modifier_stack_set.js';
import { modifierStackKindFind } from './modifier_stack_catalog.js';
import { ModifierVolume } from './modifier_volume.js';
import type { ModifierStackEntry } from './modifier_stack_types.js';
import { MODIFIER_STACK_GENERATOR_OPERATIONS } from './kinds/generator/modifier_stack_kind_generator.js';

/** Stored Operation choice of each CSG operation. */
const MODIFIER_GENERATOR_OPERATION_CHOICES: Readonly<Record<SolidOperation, string>> = {
  [SolidOperation.Additive]: 'add',
  [SolidOperation.Subtractive]: 'subtract',
  [SolidOperation.Intersecting]: 'intersect',
};

/**
 * Returns whether a stack step builds pieces, so it carries an operation.
 *
 * @param entry Stack step.
 * @returns True for generator steps.
 */
function modifierGeneratorStepIs(entry: ModifierStackEntry): boolean {
  return modifierStackKindFind(entry.kind)?.category === 'generate';
}

/**
 * Reads the CSG operation of a generator node: the stored Operation of its
 * first generator step, which its pieces inherit.
 *
 * @param node Generator node.
 * @returns Operation; Additive when unset.
 */
export function modifierGeneratorOperationRead(node: THREE.Object3D): SolidOperation {
  const step = ModifierVolume.read(node).modifiers.find(modifierGeneratorStepIs);
  return MODIFIER_STACK_GENERATOR_OPERATIONS[String(step?.parameters['operation'])] ?? SolidOperation.Additive;
}

/**
 * Builds the undoable edit setting the operation of every generator step of a
 * node, as the Additive / Subtractive / Intersect buttons do for brushes.
 *
 * @param node Generator node.
 * @param operation New operation.
 * @returns Command, or null when nothing changes.
 */
export function modifierGeneratorOperationCommand(node: THREE.Object3D, operation: SolidOperation): UndoCommand | null {
  const before = ModifierVolume.read(node);
  const choice = MODIFIER_GENERATOR_OPERATION_CHOICES[operation];
  const modifiers = before.modifiers.map((entry) =>
    modifierGeneratorStepIs(entry) ? { ...entry, parameters: { ...entry.parameters, operation: choice } } : entry,
  );
  const after = { ...before, modifiers };
  if (JSON.stringify(after) === JSON.stringify(before)) return null;
  return new CommandModifierStackSet(node, before, after);
}

/**
 * Builds operation edits for several generator nodes.
 *
 * @param nodes Generator nodes.
 * @param operation New operation.
 * @returns Commands for the nodes that change.
 */
export function modifierGeneratorOperationCommands(
  nodes: readonly THREE.Object3D[],
  operation: SolidOperation,
): UndoCommand[] {
  return nodes
    .map((node) => modifierGeneratorOperationCommand(node, operation))
    .filter((command): command is UndoCommand => command !== null);
}

/**
 * Builds edits flipping each generator node between additive and subtractive,
 * like the brush toggle; intersecting nodes stay unchanged.
 *
 * @param nodes Generator nodes.
 * @returns Commands for the nodes that change.
 */
export function modifierGeneratorOperationToggleCommands(nodes: readonly THREE.Object3D[]): UndoCommand[] {
  const commands: UndoCommand[] = [];
  for (const node of nodes) {
    const next = solidOperationToggleAdditiveSubtractive(modifierGeneratorOperationRead(node));
    const command = next === null ? null : modifierGeneratorOperationCommand(node, next);
    if (command) commands.push(command);
  }
  return commands;
}
