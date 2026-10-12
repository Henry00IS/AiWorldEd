import { describe, expect, it } from 'vitest';
import type { Vector3 } from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { EditSession } from '@/edit/session/edit_session.js';
import { HandlerComponentTopology } from '@/edit/topology/handler_component_topology.js';
import { detectTopologyCoincidentClusters } from '@/edit/topology/topology_coincident.js';
import { TOPOLOGY_VERTEX_EQUAL_EPSILON } from '@/edit/topology/topology_epsilon.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** One open edit session on a single box brush. */
interface BoxEditFixture {
  session: EditSession;
  handler: HandlerComponentTopology;
  model: SolidModel;
  brushId: string;
  brush: SolidBrush;
}

/** Two vertex indices chosen from the brush under test. */
interface VertexIndexPair {
  first: number;
  second: number;
}

describe('HandlerComponentTopology merge selection', () => {
  it('welds every coincident cluster when By Distance has no selection', () => {
    const fixture = openCoincidentBoxSession();
    expect(fixture.session.getComponentSelection().getSelectedCount()).toBe(0);
    expect(countCoincidentClusters(fixture.brush)).toBeGreaterThan(0);
    expect(fixture.handler.mergeSelection('by_distance')).toBe(true);
    expect(countCoincidentClusters(readSessionBrush(fixture))).toBe(0);
  });

  it('refuses At Center when nothing is selected', () => {
    const fixture = openCoincidentBoxSession();
    const beforeCount = fixture.brush.vertices.length;
    expect(fixture.handler.mergeSelection('at_center')).toBe(false);
    expect(readSessionBrush(fixture).vertices.length).toBe(beforeCount);
    expect(countCoincidentClusters(readSessionBrush(fixture))).toBeGreaterThan(0);
  });

  it('leaves an unselected coincident pair when By Distance has a distant selection', () => {
    const fixture = openCoincidentBoxSession();
    selectDistantPair(fixture);
    expect(fixture.handler.mergeSelection('by_distance')).toBe(false);
    expect(countCoincidentClusters(readSessionBrush(fixture))).toBeGreaterThan(0);
  });
});

/**
 * Opens an edit session whose box has one vertex copied onto another.
 *
 * @returns Live session fixture.
 */
function openCoincidentBoxSession(): BoxEditFixture {
  const fixture = openBoxEditSession();
  if (!copyVertexOntoAnother(fixture.brush, 0, 1)) {
    throw new Error('box is missing a vertex pair');
  }
  return fixture;
}

/**
 * Opens Edit Mode on a freshly built box.
 *
 * @returns Live session fixture.
 */
function openBoxEditSession(): BoxEditFixture {
  const model = new SolidModel('CoincidentMerge');
  const instance = model.addBoxBrush(1 + Math.random(), SolidOperation.Additive);
  const session = new EditSession();
  const handler = createTopologyHandler(session);
  if (!session.enter([model.root])) {
    throw new Error('edit session did not open');
  }
  return { session, handler, model, brushId: instance.id, brush: instance.brush };
}

/**
 * Builds a topology handler bound to one session.
 *
 * @param session Edit session.
 * @returns Handler.
 */
function createTopologyHandler(session: EditSession): HandlerComponentTopology {
  const commandStack = new CommandStack(8);
  return new HandlerComponentTopology({
    getSession: () => session,
    getCommandStack: () => commandStack,
    refreshPresentation: () => undefined,
    showStatusMessage: () => undefined,
  });
}

/**
 * Copies one brush vertex position onto another vertex of the same brush.
 *
 * @param brush Brush whose vertices are updated.
 * @param sourceIndex Vertex that supplies the position.
 * @param destinationIndex Vertex that receives the position.
 * @returns True when both vertices exist and differ.
 */
function copyVertexOntoAnother(brush: SolidBrush, sourceIndex: number, destinationIndex: number): boolean {
  const source = brush.vertices[sourceIndex];
  const destination = brush.vertices[destinationIndex];
  if (!source || !destination || sourceIndex === destinationIndex) {
    return false;
  }
  destination.copy(source);
  return true;
}

/**
 * Counts coincident vertex clusters on a brush.
 *
 * @param brush Brush to measure.
 * @returns Cluster count.
 */
function countCoincidentClusters(brush: SolidBrush): number {
  return detectTopologyCoincidentClusters(brushToWorkingGeometry(brush)).length;
}

/**
 * Reads the brush currently stored on the session's model.
 *
 * @param fixture Session fixture.
 * @returns Live brush.
 */
function readSessionBrush(fixture: BoxEditFixture): SolidBrush {
  const instance = fixture.model.findBrush(fixture.brushId);
  if (!instance) {
    throw new Error('brush left the model');
  }
  return instance.brush;
}

/**
 * Selects two vertices that are farther apart than the weld epsilon.
 *
 * @param fixture Session fixture.
 */
function selectDistantPair(fixture: BoxEditFixture): void {
  const pair = requireDistantPair(fixture.brush);
  const targetId = readTargetId(fixture.session);
  selectVertex(fixture.session, targetId, pair.first, false);
  selectVertex(fixture.session, targetId, pair.second, true);
}

/**
 * Finds a distant vertex pair outside the copied coincident indices.
 *
 * @param brush Brush to search.
 * @returns Distant index pair.
 */
function requireDistantPair(brush: SolidBrush): VertexIndexPair {
  const pair = findDistantVertexIndexPair(brush.vertices, new Set([0, 1]));
  if (!pair) {
    throw new Error('box has no distant vertex pair');
  }
  return pair;
}

/**
 * Returns the first domain target id.
 *
 * @param session Open edit session.
 * @returns Target id.
 */
function readTargetId(session: EditSession): string {
  const target = session.getDomain()[0];
  if (!target) {
    throw new Error('edit domain is empty');
  }
  return target.targetId;
}

/**
 * Selects one vertex on a domain target.
 *
 * @param session Open edit session.
 * @param targetId Domain target id.
 * @param vertexIndex Vertex index.
 * @param addToSelection When true, keeps the current selection.
 */
function selectVertex(session: EditSession, targetId: string, vertexIndex: number, addToSelection: boolean): void {
  session
    .getComponentSelection()
    .select({ targetId, kind: 'vertex', componentKey: String(vertexIndex) }, addToSelection);
}

/**
 * Finds two vertices farther apart than the weld epsilon.
 *
 * @param vertices Positions to search.
 * @param excluded Indices that must not be chosen.
 * @returns Index pair, or null when every remaining pair is close.
 */
function findDistantVertexIndexPair(
  vertices: readonly Vector3[],
  excluded: ReadonlySet<number>,
): VertexIndexPair | null {
  for (let first = 0; first < vertices.length; first++) {
    const second = findDistantPartnerIndex(vertices, first, excluded);
    if (second >= 0) {
      return { first, second };
    }
  }
  return null;
}

/**
 * Finds a later vertex farther than the weld epsilon from one vertex.
 *
 * @param vertices Positions to search.
 * @param first First vertex index.
 * @param excluded Indices that must not be chosen.
 * @returns Partner index, or -1 when none qualifies.
 */
function findDistantPartnerIndex(vertices: readonly Vector3[], first: number, excluded: ReadonlySet<number>): number {
  const origin = vertices[first];
  if (!origin || excluded.has(first)) {
    return -1;
  }
  for (let second = first + 1; second < vertices.length; second++) {
    if (isDistantVertex(vertices, origin, second, excluded)) {
      return second;
    }
  }
  return -1;
}

/**
 * Returns whether a vertex is far enough from an origin to stay unwelded.
 *
 * @param vertices Positions to search.
 * @param origin Reference position.
 * @param index Candidate index.
 * @param excluded Indices that must not be chosen.
 * @returns True when the candidate is outside the excluded set and the epsilon.
 */
function isDistantVertex(
  vertices: readonly Vector3[],
  origin: Vector3,
  index: number,
  excluded: ReadonlySet<number>,
): boolean {
  const candidate = vertices[index];
  if (!candidate || excluded.has(index)) {
    return false;
  }
  return origin.distanceTo(candidate) > TOPOLOGY_VERTEX_EQUAL_EPSILON;
}
