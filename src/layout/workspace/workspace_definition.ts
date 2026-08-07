import type { SerializedAreaLayout } from '@/layout/area/area_layout_serializer.js';
import {
  createDualTopPerspectiveLayout,
  createQuadLayout,
  createSinglePerspectiveLayout,
  createTripleLayout,
} from '@/layout/area/area_layout_presets.js';
import { serializeAreaLayout } from '@/layout/area/area_layout_serializer.js';

/** Named workspace: a persisted area arrangement. */
export interface WorkspaceDefinition {
  id: string;
  name: string;
  layout: SerializedAreaLayout;
}

/** Built-in workspace identifiers. */
export const WORKSPACE_IDS = {
  quad: 'workspace_quad',
  single: 'workspace_single',
  dual: 'workspace_dual',
  triple: 'workspace_triple',
} as const;

/**
 * Builds the default built-in workspaces.
 *
 * @returns Default workspace list.
 */
export function createDefaultWorkspaces(): WorkspaceDefinition[] {
  return [
    buildDefaultWorkspace(WORKSPACE_IDS.quad, 'Quad View', createQuadLayout),
    buildDefaultWorkspace(WORKSPACE_IDS.single, 'Single Perspective', createSinglePerspectiveLayout),
    buildDefaultWorkspace(WORKSPACE_IDS.dual, 'Dual', createDualTopPerspectiveLayout),
    buildDefaultWorkspace(WORKSPACE_IDS.triple, 'Triple', createTripleLayout),
  ];
}

/**
 * Builds one default workspace entry from a layout factory.
 *
 * @param id Stable workspace id.
 * @param name Display name.
 * @param createLayout Factory for the area tree root.
 * @returns Workspace definition.
 */
function buildDefaultWorkspace(
  id: string,
  name: string,
  createLayout: () => ReturnType<typeof createQuadLayout>,
): WorkspaceDefinition {
  return {
    id,
    name,
    layout: serializeAreaLayout(createLayout()),
  };
}

/**
 * Maps a pane count to a default workspace id.
 *
 * @param paneCount Pane count 1–4.
 * @returns Workspace id.
 */
export function workspaceIdForPaneCount(paneCount: 1 | 2 | 3 | 4): string {
  if (paneCount === 1) return WORKSPACE_IDS.single;
  if (paneCount === 2) return WORKSPACE_IDS.dual;
  if (paneCount === 3) return WORKSPACE_IDS.triple;
  return WORKSPACE_IDS.quad;
}
