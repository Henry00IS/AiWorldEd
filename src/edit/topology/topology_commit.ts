import type { CommandStack } from '@/commands/command_stack.js';
import { CommandComponentTopology } from './command_component_topology.js';
import { applyWorkingGeometryToTarget } from './topology_apply_working.js';
import { captureTopologySnapshot } from './topology_snapshot_capture.js';
import type { TopologySnapshot } from './topology_snapshot.js';
import type { TopologyEditTarget } from './topology_target.js';
import { brushToWorkingGeometry } from './topology_working_from_brush.js';
import { meshDocumentToWorkingGeometry } from './topology_working_from_mesh.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import type { TopologyOperatorResult } from './topology_operator_result.js';

/**
 * Loads working geometry from a live target.
 *
 * @param target Live target.
 * @returns Working copy.
 */
export function loadWorkingGeometryFromTarget(target: TopologyEditTarget): TopologyWorkingGeometry {
  if (target.kind === 'mesh') {
    return meshDocumentToWorkingGeometry(target.document);
  }
  return brushToWorkingGeometry(target.brush);
}

/**
 * Applies a working-geometry mutator, writes it back, and records undo.
 *
 * @param target Live target.
 * @param commandStack Undo stack, or null.
 * @param mutate Mutator that edits working geometry.
 * @param afterDisplaysRebuilt Optional presentation refresh.
 * @returns Operator result.
 */
export function commitTopologyWorkingMutation(
  target: TopologyEditTarget,
  commandStack: CommandStack | null,
  mutate: (geometry: TopologyWorkingGeometry) => TopologyOperatorResult,
  afterDisplaysRebuilt: (() => void) | null = null,
): TopologyOperatorResult {
  const before = captureTopologySnapshot(target);
  const working = loadWorkingGeometryFromTarget(target);
  const mutated = mutate(working);
  if (!mutated.applied) {
    return mutated;
  }
  return writeMutationAndRecord(target, commandStack, working, before, afterDisplaysRebuilt);
}

/**
 * Writes mutated geometry and records the undo command when the write succeeds.
 *
 * @param target Live target.
 * @param commandStack Undo stack, or null.
 * @param working Mutated working geometry.
 * @param before Pre-edit snapshot.
 * @param afterDisplaysRebuilt Presentation refresh.
 * @returns Operator result.
 */
function writeMutationAndRecord(
  target: TopologyEditTarget,
  commandStack: CommandStack | null,
  working: TopologyWorkingGeometry,
  before: TopologySnapshot,
  afterDisplaysRebuilt: (() => void) | null,
): TopologyOperatorResult {
  const sourceBrush = before.kind === 'brush' ? before : null;
  const written = applyWorkingGeometryToTarget(target, working, sourceBrush);
  if (!written.applied) {
    return written;
  }
  recordTopologyCommand(commandStack, before, captureTopologySnapshot(target), afterDisplaysRebuilt);
  afterDisplaysRebuilt?.();
  return written;
}

/**
 * Pushes a topology command that has already been applied.
 *
 * @param commandStack Undo stack, or null.
 * @param before Pre-edit snapshot.
 * @param after Post-edit snapshot.
 * @param afterDisplaysRebuilt Presentation refresh.
 */
function recordTopologyCommand(
  commandStack: CommandStack | null,
  before: TopologySnapshot,
  after: TopologySnapshot,
  afterDisplaysRebuilt: (() => void) | null,
): void {
  if (!commandStack) {
    return;
  }
  commandStack.recordExecuted(new CommandComponentTopology([before], [after], afterDisplaysRebuilt));
}
