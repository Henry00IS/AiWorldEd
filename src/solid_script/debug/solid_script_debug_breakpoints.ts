import type * as THREE from 'three';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptBlock, SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';

/**
 * Breakpoints of the scripts open in this editor, by generator node uuid and
 * modifier id. A breakpoint belongs to a line (its block id), so it moves with
 * the line. Like the step limit, breakpoints only change how this editor runs
 * the script: they are not saved, undone or sent to other users.
 */
const solidScriptDebugBreakpointSets = new Map<string, Set<string>>();

/**
 * Returns the key of one generator modifier.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @returns Map key.
 */
function solidScriptDebugBreakpointKey(node: THREE.Object3D, stepId: string): string {
  return `${node.uuid}:${stepId}`;
}

/**
 * Returns whether a line can hold a breakpoint: it has to do something when the
 * script runs, so notes, blank lines, End and Else cannot.
 *
 * @param block Line.
 * @returns True when a breakpoint can pause there.
 */
export function solidScriptDebugBreakpointAllowed(block: SolidScriptBlock | undefined): boolean {
  const command = block ? solidScriptCommandFind(block.command) : undefined;
  if (!command?.runs) return false;
  const nesting = solidScriptBlockNesting(block);
  return nesting !== 'close' && nesting !== 'continue';
}

/**
 * Returns the block ids that hold a breakpoint.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @returns Block ids.
 */
export function solidScriptDebugBreakpoints(node: THREE.Object3D, stepId: string): ReadonlySet<string> {
  return solidScriptDebugBreakpointSets.get(solidScriptDebugBreakpointKey(node, stepId)) ?? new Set();
}

/**
 * Sets or clears the breakpoint of a line.
 *
 * @param node Generator node.
 * @param stepId Modifier id.
 * @param blockId Block id of the line.
 * @param on True to set it.
 */
export function solidScriptDebugBreakpointSet(
  node: THREE.Object3D,
  stepId: string,
  blockId: string,
  on: boolean,
): void {
  const key = solidScriptDebugBreakpointKey(node, stepId);
  const set = solidScriptDebugBreakpointSets.get(key) ?? new Set<string>();
  if (on) set.add(blockId);
  else set.delete(blockId);
  if (set.size > 0) solidScriptDebugBreakpointSets.set(key, set);
  else solidScriptDebugBreakpointSets.delete(key);
}

/**
 * Returns the 1-based lines of a script that hold a breakpoint and can pause.
 *
 * @param document Script.
 * @param blockIds Block ids that hold a breakpoint.
 * @returns Line numbers.
 */
export function solidScriptDebugBreakpointLines(
  document: SolidScriptDocument,
  blockIds: ReadonlySet<string>,
): Set<number> {
  const lines = new Set<number>();
  document.blocks.forEach((block, index) => {
    if (blockIds.has(block.id) && solidScriptDebugBreakpointAllowed(block)) lines.add(index + 1);
  });
  return lines;
}
