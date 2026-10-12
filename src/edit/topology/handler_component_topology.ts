import type { Vector3 } from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { EditSession } from '@/edit/session/edit_session.js';
import { commitTopologyWorkingMutation } from './topology_commit.js';
import {
  deleteTopologyWorkingEdges,
  deleteTopologyWorkingFaces,
  deleteTopologyWorkingVertices,
} from './topology_component_delete.js';
import { dissolveTopologyWorkingEdge } from './topology_edge_dissolve.js';
import { dissolveTopologyWorkingFaces } from './topology_face_dissolve.js';
import { dissolveTopologyWorkingVertices } from './topology_vertex_dissolve_batch.js';
import { applyTopologyLoopCut } from './topology_loop_cut.js';
import { cloneLoopCutInsertedPositions, resolveLoopCutComponentIndices } from './topology_loop_cut_brush_indices.js';
import { buildLoopCutComponentSelection } from './topology_loop_cut_selection.js';
import type { TopologyWorkingEdge } from './topology_working_edge_key.js';
import { splitTopologyWorkingEdge } from './topology_edge_split.js';
import { mergeTopologyWorkingVertices } from './topology_vertex_merge.js';
import type { TopologyVertexMergeMode } from './topology_vertex_merge_mode.js';
import {
  collectSelectedEdgeEndpoints,
  collectSelectedFaceIndices,
  collectSelectedVertexIndices,
  collectSelectionTargetIds,
} from './topology_selection_vertices.js';
import { findEditDomainTargetById, resolveTopologyEditTarget } from './topology_target_resolve.js';
import type { TopologyEditTarget } from './topology_target.js';
import type { TopologyWorkingGeometry } from './topology_working_geometry.js';
import {
  topologyOperatorApplied,
  topologyOperatorRefused,
  type TopologyOperatorResult,
} from './topology_operator_result.js';

/** Vertices inserted by a loop cut before the target is rebuilt. */
interface LoopCutInsertionCapture {
  /** Working-geometry indices in loop order. */
  indices: readonly number[] | null;
  /** Positions of those indices in the same order. */
  positions: readonly Vector3[] | null;
}

/** Dependencies for component topology edits. */
export interface HandlerComponentTopologyDependencies {
  getSession: () => EditSession;
  getCommandStack: () => CommandStack | null;
  refreshPresentation: () => void;
  showStatusMessage: (message: string) => void;
}

/**
 * Applies dissolve, merge, knife, and loop-cut operators to the Edit Mode
 * domain through the shared command stack.
 */
export class HandlerComponentTopology {
  private readonly deps: HandlerComponentTopologyDependencies;

  /**
   * Creates the topology handler.
   *
   * @param deps Session, undo, and presentation callbacks.
   */
  constructor(deps: HandlerComponentTopologyDependencies) {
    this.deps = deps;
  }

  /**
   * Dissolves the current component selection.
   *
   * @returns True when at least one target changed.
   */
  dissolveSelection(): boolean {
    const session = this.deps.getSession();
    if (!session.isActive()) {
      return false;
    }
    const mode = session.getComponentMode();
    return this.mutateEachSelectedTarget((target, geometry, selected) =>
      dissolveSelectionOnGeometry(target, geometry, selected, mode),
    );
  }

  /**
   * Deletes the current component selection. Edges take their vertices and
   * every face that used those vertices. Remaining faces are left unchanged.
   *
   * @returns True when at least one target changed.
   */
  deleteSelection(): boolean {
    const session = this.deps.getSession();
    if (!session.isActive()) {
      return false;
    }
    const mode = session.getComponentMode();
    return this.mutateEachSelectedTarget((_target, geometry, selected) =>
      deleteSelectionOnGeometry(geometry, selected, _target.targetId, mode),
    );
  }

  /**
   * Merges selected vertices on every selected target. By Distance with nothing
   * selected welds every coincident cluster on every domain target.
   *
   * @param mode Merge mode.
   * @returns True when at least one target changed.
   */
  mergeSelection(mode: TopologyVertexMergeMode): boolean {
    if (this.shouldMergeWholeDomainByDistance(mode)) {
      return this.mergeWholeDomainByDistance();
    }
    return this.mutateEachSelectedTarget((target, geometry, selected) =>
      mergeTopologyWorkingVertices(geometry, collectSelectedVertexIndices(selected, target.targetId), mode),
    );
  }

  /**
   * Returns whether By Distance should weld every domain target.
   *
   * @param mode Merge mode.
   * @returns True when the session is active and nothing is selected.
   */
  private shouldMergeWholeDomainByDistance(mode: TopologyVertexMergeMode): boolean {
    if (mode !== 'by_distance') {
      return false;
    }
    const session = this.deps.getSession();
    return session.isActive() && session.getComponentSelection().getSelectedCount() === 0;
  }

  /**
   * Welds coincident vertices on every domain target.
   *
   * @returns True when at least one target changed.
   */
  private mergeWholeDomainByDistance(): boolean {
    let appliedAny = false;
    let lastMessage = '';
    for (const domainTarget of this.deps.getSession().getDomain()) {
      const outcome = this.mergeDomainTargetByDistance(domainTarget.targetId);
      appliedAny = appliedAny || outcome.applied;
      lastMessage = outcome.message || lastMessage;
    }
    return this.finishSelectionMutation(appliedAny, lastMessage);
  }

  /**
   * Welds coincident vertices on one domain target.
   *
   * @param targetId Domain target id.
   * @returns Operator result.
   */
  private mergeDomainTargetByDistance(targetId: string): TopologyOperatorResult {
    return this.mutateOneSelectedTarget(targetId, [], (target, geometry) =>
      mergeTopologyWorkingVertices(geometry, collectSelectedVertexIndices([], target.targetId), 'by_distance'),
    );
  }

  /**
   * Splits one edge at a parameter.
   *
   * @param targetId Target id.
   * @param vertexA First endpoint.
   * @param vertexB Second endpoint.
   * @param parameter Split parameter.
   * @returns True when applied.
   */
  splitEdge(targetId: string, vertexA: number, vertexB: number, parameter: number): boolean {
    return this.mutateNamedTarget(targetId, (geometry) => {
      const split = splitTopologyWorkingEdge(geometry, vertexA, vertexB, parameter);
      if (!split) {
        return topologyOperatorRefused('Cannot split that edge');
      }
      return topologyOperatorApplied();
    });
  }

  /**
   * Applies a loop cut from a hovered edge.
   *
   * @param targetId Target id.
   * @param vertexA Hovered edge start.
   * @param vertexB Hovered edge end.
   * @param parameter Slide parameter.
   * @param lockedEdges Optional first-click belt.
   * @returns True when applied.
   */
  loopCut(
    targetId: string,
    vertexA: number,
    vertexB: number,
    parameter: number,
    lockedEdges?: readonly TopologyWorkingEdge[],
  ): boolean {
    const captured = this.captureLoopCutMutation(targetId, vertexA, vertexB, parameter, lockedEdges);
    if (!captured) {
      return false;
    }
    this.selectResolvedLoopCut(targetId, captured);
    return true;
  }

  /**
   * Applies a loop cut and keeps the vertices it inserted.
   *
   * @param targetId Target id.
   * @param vertexA Hovered edge start.
   * @param vertexB Hovered edge end.
   * @param parameter Slide parameter.
   * @param lockedEdges Optional first-click belt.
   * @returns Capture, or null when the cut was refused.
   */
  private captureLoopCutMutation(
    targetId: string,
    vertexA: number,
    vertexB: number,
    parameter: number,
    lockedEdges?: readonly TopologyWorkingEdge[],
  ): LoopCutInsertionCapture | null {
    const captured: LoopCutInsertionCapture = { indices: null, positions: null };
    const applied = this.mutateNamedTarget(targetId, (geometry) =>
      this.captureAppliedLoopCut(geometry, vertexA, vertexB, parameter, lockedEdges, captured),
    );
    if (!applied) {
      return null;
    }
    return captured;
  }

  /**
   * Runs the loop cut and stores inserted vertices when it applies.
   *
   * @param geometry Working geometry.
   * @param vertexA Hovered edge start.
   * @param vertexB Hovered edge end.
   * @param parameter Slide parameter.
   * @param lockedEdges Optional first-click belt.
   * @param captured Output slot for inserted vertices.
   * @returns Operator result.
   */
  private captureAppliedLoopCut(
    geometry: TopologyWorkingGeometry,
    vertexA: number,
    vertexB: number,
    parameter: number,
    lockedEdges: readonly TopologyWorkingEdge[] | undefined,
    captured: LoopCutInsertionCapture,
  ): TopologyOperatorResult {
    const result = applyTopologyLoopCut(geometry, vertexA, vertexB, parameter, lockedEdges);
    this.storeAppliedLoopCut(geometry, result.applied, result.insertedVertexIndices, captured);
    return result;
  }

  /**
   * Stores inserted indices and positions when the cut applied.
   *
   * @param geometry Working geometry after the cut.
   * @param applied Whether the cut applied.
   * @param insertedVertexIndices Inserted working-geometry indices.
   * @param captured Output slot.
   */
  private storeAppliedLoopCut(
    geometry: TopologyWorkingGeometry,
    applied: boolean,
    insertedVertexIndices: readonly number[],
    captured: LoopCutInsertionCapture,
  ): void {
    captured.indices = applied ? insertedVertexIndices : null;
    captured.positions = applied ? cloneLoopCutInsertedPositions(geometry, insertedVertexIndices) : null;
  }

  /**
   * Selects the committed loop using indices that match the rebuilt target.
   *
   * @param targetId Target id.
   * @param captured Inserted vertices from the working geometry.
   */
  private selectResolvedLoopCut(targetId: string, captured: LoopCutInsertionCapture): void {
    const indices = this.resolveCommittedLoopCutIndices(targetId, captured);
    this.selectInsertedLoopCut(targetId, indices ?? []);
  }

  /**
   * Resolves selection indices for the target after the commit.
   *
   * @param targetId Target id.
   * @param captured Inserted vertices from the working geometry.
   * @returns Indices to select, or null when they cannot be resolved.
   */
  private resolveCommittedLoopCutIndices(
    targetId: string,
    captured: LoopCutInsertionCapture,
  ): readonly number[] | null {
    if (!captured.indices || !captured.positions) {
      return null;
    }
    const target = this.resolveTarget(targetId);
    if (!target) {
      return null;
    }
    return resolveLoopCutComponentIndices(
      target.kind,
      captured.indices,
      captured.positions,
      readBrushVerticesForLoopCut(target),
    );
  }

  /**
   * Selects the inserted loop in vertex or edge mode and clears face mode.
   *
   * @param targetId Target id.
   * @param inserted Inserted vertices in loop order.
   */
  private selectInsertedLoopCut(targetId: string, inserted: readonly number[]): void {
    const session = this.deps.getSession();
    const entries = buildLoopCutComponentSelection(targetId, session.getComponentMode(), inserted);
    session.getComponentSelection().replaceAll(entries);
    this.deps.showStatusMessage(session.formatStatusLabel());
  }

  /**
   * Applies a mutator to one named target.
   *
   * @param targetId Target id.
   * @param mutate Working-geometry mutator.
   * @returns True when applied.
   */
  private mutateNamedTarget(
    targetId: string,
    mutate: (geometry: TopologyWorkingGeometry) => TopologyOperatorResult,
  ): boolean {
    const target = this.resolveTarget(targetId);
    if (!target) {
      this.deps.showStatusMessage('No editable target');
      return false;
    }
    const result = commitTopologyWorkingMutation(target, this.deps.getCommandStack(), mutate, () =>
      this.deps.refreshPresentation(),
    );
    return this.reportResult(result);
  }

  /**
   * Applies a mutator to each selected target.
   *
   * @param mutate Per-target mutator.
   * @returns True when any target changed.
   */
  private mutateEachSelectedTarget(
    mutate: (
      target: TopologyEditTarget,
      geometry: TopologyWorkingGeometry,
      selected: readonly ComponentSelectionEntry[],
    ) => TopologyOperatorResult,
  ): boolean {
    const session = this.deps.getSession();
    const selected = session.getComponentSelection().getSelected();
    let appliedAny = false;
    let lastMessage = '';
    for (const targetId of collectSelectionTargetIds(selected)) {
      const outcome = this.mutateOneSelectedTarget(targetId, selected, mutate);
      appliedAny = appliedAny || outcome.applied;
      lastMessage = outcome.message || lastMessage;
    }
    return this.finishSelectionMutation(appliedAny, lastMessage);
  }

  /**
   * Applies a mutator to one selected target.
   *
   * @param targetId Target id.
   * @param selected Full selection.
   * @param mutate Per-target mutator.
   * @returns Operator result.
   */
  private mutateOneSelectedTarget(
    targetId: string,
    selected: readonly ComponentSelectionEntry[],
    mutate: (
      target: TopologyEditTarget,
      geometry: TopologyWorkingGeometry,
      selected: readonly ComponentSelectionEntry[],
    ) => TopologyOperatorResult,
  ): TopologyOperatorResult {
    const target = this.resolveTarget(targetId);
    if (!target) {
      return topologyOperatorRefused('');
    }
    return commitTopologyWorkingMutation(
      target,
      this.deps.getCommandStack(),
      (geometry) => mutate(target, geometry, selected),
      () => this.deps.refreshPresentation(),
    );
  }

  /**
   * Resolves a live topology target from the open session.
   *
   * @param targetId Target id.
   * @returns Target, or null.
   */
  private resolveTarget(targetId: string): TopologyEditTarget | null {
    const domain = findEditDomainTargetById(this.deps.getSession().getDomain(), targetId);
    if (!domain) {
      return null;
    }
    return resolveTopologyEditTarget(domain);
  }

  /**
   * Publishes an operator result and returns whether it applied.
   *
   * @param result Operator result.
   * @returns True when applied.
   */
  private reportResult(result: TopologyOperatorResult): boolean {
    if (result.message) {
      this.deps.showStatusMessage(result.message);
    }
    return result.applied;
  }

  /**
   * Finishes a multi-target mutation with status and selection clear.
   *
   * @param appliedAny Whether any target changed.
   * @param lastMessage Last operator message.
   * @returns True when anything applied.
   */
  private finishSelectionMutation(appliedAny: boolean, lastMessage: string): boolean {
    if (appliedAny) {
      this.deps.getSession().getComponentSelection().clear();
      this.deps.refreshPresentation();
    }
    this.publishSelectionMutationStatus(appliedAny, lastMessage);
    return appliedAny;
  }

  /**
   * Publishes status after a selection mutation.
   *
   * @param appliedAny Whether any target changed.
   * @param lastMessage Last operator message.
   */
  private publishSelectionMutationStatus(appliedAny: boolean, lastMessage: string): void {
    if (lastMessage) {
      this.deps.showStatusMessage(lastMessage);
      return;
    }
    if (!appliedAny) {
      this.deps.showStatusMessage('Nothing to dissolve or merge');
    }
  }
}

/**
 * Reads rebuilt brush vertices, or an empty list for a mesh.
 *
 * @param target Live target after the commit.
 * @returns Brush vertices.
 */
function readBrushVerticesForLoopCut(target: TopologyEditTarget): readonly Vector3[] {
  if (target.kind !== 'brush') {
    return [];
  }
  return target.brush.vertices;
}

/**
 * Deletes the selection on one target's working geometry.
 *
 * @param geometry Working geometry.
 * @param selected Full selection.
 * @param targetId Target whose selection is read.
 * @param mode Component mode.
 * @returns Operator result.
 */
function deleteSelectionOnGeometry(
  geometry: TopologyWorkingGeometry,
  selected: readonly ComponentSelectionEntry[],
  targetId: string,
  mode: EditorComponentMode,
): TopologyOperatorResult {
  if (mode === EditorComponentMode.VERTEX) {
    return deleteTopologyWorkingVertices(geometry, collectSelectedVertexIndices(selected, targetId));
  }
  if (mode === EditorComponentMode.EDGE) {
    return deleteTopologyWorkingEdges(geometry, collectSelectedEdgeEndpoints(selected, targetId));
  }
  return deleteTopologyWorkingFaces(geometry, collectSelectedFaceIndices(selected, targetId));
}

/**
 * Dissolves the selection on one target's working geometry.
 *
 * @param target Live target.
 * @param geometry Working geometry.
 * @param selected Full selection.
 * @param mode Component mode.
 * @returns Operator result.
 */
function dissolveSelectionOnGeometry(
  target: TopologyEditTarget,
  geometry: TopologyWorkingGeometry,
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
): TopologyOperatorResult {
  const requireSolid = target.kind === 'brush';
  if (mode === EditorComponentMode.VERTEX) {
    return dissolveSelectedVertices(geometry, collectSelectedVertexIndices(selected, target.targetId), requireSolid);
  }
  if (mode === EditorComponentMode.EDGE) {
    return dissolveSelectedEdges(geometry, collectSelectedEdgeEndpoints(selected, target.targetId), requireSolid);
  }
  return dissolveTopologyWorkingFaces(geometry, collectSelectedFaceIndices(selected, target.targetId), requireSolid);
}

/**
 * Dissolves selected vertices from highest index to lowest.
 *
 * @param geometry Working geometry.
 * @param vertexIndices Selected vertices.
 * @param requireSolid Brush remainder guard.
 * @returns Operator result.
 */
function dissolveSelectedVertices(
  geometry: TopologyWorkingGeometry,
  vertexIndices: readonly number[],
  requireSolid: boolean,
): TopologyOperatorResult {
  if (vertexIndices.length === 0) {
    return topologyOperatorRefused('Select vertices to dissolve');
  }
  const sorted = vertexIndices.slice().sort((left, right) => right - left);
  return dissolveVertexList(geometry, sorted, requireSolid);
}

/**
 * Dissolves a descending vertex list.
 *
 * @param geometry Working geometry.
 * @param sorted Descending vertex indices.
 * @param requireSolid Brush remainder guard.
 * @returns Operator result.
 */
function dissolveVertexList(
  geometry: TopologyWorkingGeometry,
  sorted: readonly number[],
  requireSolid: boolean,
): TopologyOperatorResult {
  return dissolveTopologyWorkingVertices(geometry, sorted, requireSolid);
}

/**
 * Dissolves selected edges.
 *
 * @param geometry Working geometry.
 * @param edges Selected edges.
 * @param requireSolid Planarity guard for brushes.
 * @returns Operator result.
 */
function dissolveSelectedEdges(
  geometry: TopologyWorkingGeometry,
  edges: ReadonlyArray<{ vertexA: number; vertexB: number }>,
  requireSolid: boolean,
): TopologyOperatorResult {
  if (edges.length === 0) {
    return topologyOperatorRefused('Select edges to dissolve');
  }
  const first = edges[0];
  if (!first) {
    return topologyOperatorRefused('Select edges to dissolve');
  }
  return dissolveTopologyWorkingEdge(geometry, first.vertexA, first.vertexB, requireSolid);
}
