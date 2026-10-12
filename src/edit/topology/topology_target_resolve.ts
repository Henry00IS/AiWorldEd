import { readBoundMeshEditDocument } from '@/edit/mesh/mesh_edit_binding.js';
import type { EditDomainTarget } from '@/edit/session/edit_session_domain.js';
import type { TopologyEditTarget } from './topology_target.js';

/**
 * Resolves a live topology target from an edit-domain entry.
 *
 * @param domain Domain target.
 * @returns Live topology target, or null.
 */
export function resolveTopologyEditTarget(domain: EditDomainTarget): TopologyEditTarget | null {
  if (domain.kind === 'content_mesh') {
    return resolveMeshTopologyTarget(domain);
  }
  return resolveBrushTopologyTarget(domain);
}

/**
 * Resolves a mesh domain target.
 *
 * @param domain Content mesh domain.
 * @returns Mesh topology target, or null.
 */
function resolveMeshTopologyTarget(
  domain: Extract<EditDomainTarget, { kind: 'content_mesh' }>,
): TopologyEditTarget | null {
  const document = readBoundMeshEditDocument(domain.mesh);
  if (!document) {
    return null;
  }
  return {
    kind: 'mesh',
    targetId: domain.targetId,
    mesh: domain.mesh,
    document,
  };
}

/**
 * Resolves a brush domain target.
 *
 * @param domain Brush domain.
 * @returns Brush topology target, or null.
 */
function resolveBrushTopologyTarget(domain: Extract<EditDomainTarget, { kind: 'brush' }>): TopologyEditTarget | null {
  const instance = domain.solidModel.findBrush(domain.brushId);
  if (!instance) {
    return null;
  }
  return {
    kind: 'brush',
    targetId: domain.targetId,
    solidModel: domain.solidModel,
    brushId: domain.brushId,
    brush: instance.brush,
    mesh: instance.mesh,
  };
}

/**
 * Finds a domain target by id.
 *
 * @param domain Domain list.
 * @param targetId Target id.
 * @returns Domain target, or null.
 */
export function findEditDomainTargetById(
  domain: readonly EditDomainTarget[],
  targetId: string,
): EditDomainTarget | null {
  for (const entry of domain) {
    if (entry.targetId === targetId) {
      return entry;
    }
  }
  return null;
}
