import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { EditSession } from '@/edit/session/edit_session.js';
import { HandlerComponentTopology } from '@/edit/topology/handler_component_topology.js';
import { loadWorkingGeometryFromTarget } from '@/edit/topology/topology_commit.js';
import { findEditDomainTargetById, resolveTopologyEditTarget } from '@/edit/topology/topology_target_resolve.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

/** One open edit session on a single content mesh. */
export interface TopologyMeshEditFixture {
  /** Live session. */
  session: EditSession;
  /** Topology handler bound to the session. */
  handler: HandlerComponentTopology;
  /** Undo stack used by the handler. */
  commandStack: CommandStack;
  /** Edited mesh. */
  mesh: THREE.Mesh;
  /** Target id of the mesh. */
  targetId: string;
}

/**
 * Opens Edit Mode on a freshly built box mesh with a random size.
 *
 * @returns Live session fixture.
 */
export function openTopologyMeshEditFixture(): TopologyMeshEditFixture {
  const size = 1 + Math.random();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  const session = new EditSession();
  const commandStack = new CommandStack(16);
  const handler = new HandlerComponentTopology({
    getSession: () => session,
    getCommandStack: () => commandStack,
    refreshPresentation: () => undefined,
    showStatusMessage: () => undefined,
  });
  if (!session.enter([mesh])) {
    throw new Error('edit session did not open');
  }
  return { session, handler, commandStack, mesh, targetId: mesh.uuid };
}

/**
 * Reads the current working geometry of the fixture mesh.
 *
 * @param fixture Live fixture.
 * @returns Working geometry copy.
 */
export function readTopologyMeshFixtureGeometry(fixture: TopologyMeshEditFixture): TopologyWorkingGeometry {
  const domain = findEditDomainTargetById(fixture.session.getDomain(), fixture.targetId);
  const target = domain ? resolveTopologyEditTarget(domain) : null;
  if (!target) {
    throw new Error('mesh target is missing');
  }
  return loadWorkingGeometryFromTarget(target);
}
