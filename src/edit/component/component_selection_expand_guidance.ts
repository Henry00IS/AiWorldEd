import type { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { ComponentSelectionEntry } from './component_selection_entry.js';
import {
  classifyEditSelectLoopOrRing,
  type EditSelectLoopGuidanceKind,
  type EditSelectOperation,
} from './component_selection_expand.js';
import type { ComponentTopologyTarget } from './component_selection_topology.js';

/** Status shown when loop has no edge to start from in Edge select. */
export const EDIT_SELECT_NEED_EDGE_LOOP =
  'Select an edge, then Select Loop to follow the edge loop through four-way vertices.';

/** Status shown when ring has no edge to start from in Edge select. */
export const EDIT_SELECT_NEED_EDGE_RING = 'Select an edge, then Select Ring to step across quads.';

/** Status shown when loop or ring needs two vertices that share an edge. */
export const EDIT_SELECT_NEED_VERTEX_PAIR =
  'Select two vertices that share an edge, or press 2 for Edge select and select an edge.';

/** Status shown when loop or ring needs two adjacent faces. */
export const EDIT_SELECT_NEED_FACE_PAIR =
  'Select two adjacent faces to run a face loop, or press 2 for Edge select and select an edge.';

/** Status shown when selected edges do not run through four-way vertices. */
export const EDIT_SELECT_NO_EDGE_LOOP =
  'No edge loop through four-way vertices from this selection. Select Ring steps across quads.';

/** Status shown when selected edges do not sit on a ring of quads. */
export const EDIT_SELECT_NO_EDGE_RING = 'No edge ring across quads from this selection.';

/** Status shown when selected faces do not sit in a strip of quads. */
export const EDIT_SELECT_NO_FACE_STRIP =
  'No face loop from this selection. Select two adjacent faces that sit in a strip of quads.';

/**
 * Returns the status bar text after a selection operation. Loop and Ring
 * explain what to select when they cannot grow the selection; other operations
 * report the new count.
 *
 * @param operation Operation that just ran.
 * @param selected Selection before the operation.
 * @param mode Current component mode.
 * @param topologies Topology of every edited target.
 * @param next Selection after the operation.
 * @returns Status text.
 */
export function editSelectOperationStatus(
  operation: EditSelectOperation,
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
  next: readonly ComponentSelectionEntry[],
): string {
  const guidance = editSelectOperationGuidance(operation, selected, mode, topologies);
  return guidance ?? editSelectCountStatus(next.length);
}

/**
 * Returns a guidance message when Loop or Ring cannot run from the current mode
 * and selection, or null when the operation already applied.
 *
 * @param operation Operation.
 * @param selected Current selection.
 * @param mode Current component mode.
 * @param topologies Topology of every edited target.
 * @returns Guidance text, or null.
 */
export function editSelectOperationGuidance(
  operation: EditSelectOperation,
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): string | null {
  if (operation !== 'loop' && operation !== 'ring') {
    return null;
  }
  const kind = classifyEditSelectLoopOrRing(operation, selected, mode, topologies);
  return kind ? editSelectGuidanceText(operation, kind) : null;
}

/**
 * Maps a loop or ring classification to a status message.
 *
 * @param operation Loop or ring.
 * @param kind Guidance kind.
 * @returns Status text.
 */
function editSelectGuidanceText(operation: 'loop' | 'ring', kind: EditSelectLoopGuidanceKind): string {
  if (kind === 'needSelection') return operation === 'loop' ? EDIT_SELECT_NEED_EDGE_LOOP : EDIT_SELECT_NEED_EDGE_RING;
  if (kind === 'needVertexPair') return EDIT_SELECT_NEED_VERTEX_PAIR;
  if (kind === 'needFacePair') return EDIT_SELECT_NEED_FACE_PAIR;
  if (kind === 'noEdgeLoop') return EDIT_SELECT_NO_EDGE_LOOP;
  if (kind === 'noEdgeRing') return EDIT_SELECT_NO_EDGE_RING;
  return EDIT_SELECT_NO_FACE_STRIP;
}

/**
 * Builds the usual "N components selected" status text.
 *
 * @param count Number of selected components.
 * @returns Status text.
 */
function editSelectCountStatus(count: number): string {
  return `${count} ${count === 1 ? 'component' : 'components'} selected`;
}
