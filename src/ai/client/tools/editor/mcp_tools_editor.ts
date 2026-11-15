import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import { mcpArgumentStringArray, mcpArgumentStringOptional } from '@/ai/client/tools/mcp_tool_arguments.js';

/** Editor-wide context and the editor's menus. */
export class McpToolsEditor extends McpToolGroup {
  readonly category = 'editor';
  readonly summary = 'Editor context, and every menu entry of the editor: list and run.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the editor tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'editor_context_get',
        description:
          'Call first. Returns the editor version, coordinate system (right-handed, Y up, meters), snap settings, undo/redo counts and a selection summary.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.getEditorContext(),
      },
      {
        name: 'editor_menu_list',
        description:
          'Lists every visible editor menu entry (toolbar menus such as Edit, Add, CSG and the viewport Object, Align, Mode, Select, Mesh, Vertex, Edge, Face menus) with path, enabled state, shortcut and tooltip. New menu entries appear automatically.',
        inputSchema: mcpSchemaObject({
          menu: { type: 'string', description: 'Menu name to list alone, such as Face.' },
        }),
        mutates: false,
        run: (args) => this.parts.menu.menuList(mcpArgumentStringOptional(args, 'menu')),
      },
      {
        name: 'editor_menu_run',
        description:
          'Runs a menu entry exactly like a click, on the current selection and mode (undoable, synced in multiplayer). File and Collaborate entries and entries that open dialogs are refused.',
        inputSchema: mcpSchemaObject(
          {
            path: {
              type: 'array',
              items: { type: 'string' },
              description: 'Path from editor_menu_list, such as ["Edit", "Duplicate"].',
            },
          },
          ['path'],
        ),
        mutates: true,
        run: (args) => this.parts.menu.menuRun(mcpArgumentStringArray(args, 'path')),
      },
    ];
  }
}
