import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { McpToolGroup } from './mcp_tool_group.js';
import { McpToolsEditor } from './editor/mcp_tools_editor.js';
import { McpToolsMath } from './math/mcp_tools_math.js';
import { McpToolsHistory } from './history/mcp_tools_history.js';
import { McpToolsSnap } from './snap/mcp_tools_snap.js';
import { McpToolsSelection } from './selection/mcp_tools_selection.js';
import { McpToolsScene } from './scene/mcp_tools_scene.js';
import { McpToolsSolidModel } from './solid_model/mcp_tools_solid_model.js';
import { McpToolsCsgGroup } from './csg_group/mcp_tools_csg_group.js';
import { McpToolsBrush } from './brush/mcp_tools_brush.js';
import { McpToolsBuild } from './build/mcp_tools_build.js';
import { McpToolsGeometry } from './geometry/mcp_tools_geometry.js';
import { McpToolsModifier } from './modifier/mcp_tools_modifier.js';
import { McpToolsCurve } from './curve/mcp_tools_curve.js';
import { McpToolsSpace } from './space/mcp_tools_space.js';
import { McpToolsView } from './view/mcp_tools_view.js';

/**
 * Creates every MCP tool group in listing order.
 *
 * @param parts Editor API implementation parts.
 * @returns Tool groups.
 */
export function mcpToolGroupsCreate(parts: EditorApiParts): McpToolGroup[] {
  return [
    new McpToolsEditor(parts),
    new McpToolsHistory(parts),
    new McpToolsSelection(parts),
    new McpToolsSnap(parts),
    new McpToolsScene(parts),
    new McpToolsSolidModel(parts),
    new McpToolsCsgGroup(parts),
    new McpToolsBrush(parts),
    new McpToolsGeometry(parts),
    new McpToolsModifier(parts),
    new McpToolsCurve(parts),
    new McpToolsBuild(parts),
    new McpToolsSpace(parts),
    new McpToolsView(parts),
    new McpToolsMath(),
  ];
}
