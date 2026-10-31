import { bench, describe } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import type { CommandStackObserver } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';

const COMMAND: UndoCommand = { execute: () => undefined, undo: () => undefined };
const ITERATIONS = 1000;

/**
 * Pushes a batch of commands and clears the stack.
 *
 * @param stack Command stack.
 */
function stackCycle(stack: CommandStack): void {
  for (let index = 0; index < ITERATIONS; index++) stack.push(COMMAND);
  stack.clear();
}

/**
 * Creates an observer that leaves history to the stack's caller.
 *
 * @returns Observer.
 */
function observerCreate(): CommandStackObserver {
  return {
    commandExecuted: () => undefined,
    historyUndo: () => false,
    historyRedo: () => false,
    historyUndoCount: () => 0,
    historyRedoCount: () => 0,
  };
}

/**
 * Offline history cost: the detached observer is a single null check. Run with
 * `bunx vitest bench`.
 */
describe('command stack offline overhead', () => {
  const offline = new CommandStack(ITERATIONS);
  const online = new CommandStack(ITERATIONS);
  online.observerSet(observerCreate());
  bench('offline (observer detached)', () => stackCycle(offline));
  bench('online (observer attached)', () => stackCycle(online));
});
