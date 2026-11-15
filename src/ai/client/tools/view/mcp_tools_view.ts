import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import { MCP_SCHEMA_VECTOR3 } from '@/ai/client/tools/mcp_tool_schema.js';
import type { CaptureViewArgs } from '@/ai/client/editor_api_capture_types.js';
/** Pictures of the world from any camera. */
export class McpToolsView extends McpToolGroup {
  readonly category = 'view';
  readonly summary = 'Pictures of the world from any camera.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the view tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'view_capture',
        description: [
          'Take a picture of the 3D world (JPEG, default 256×256). Does not move editor viewports.',
          'Images auto-compress for MCP size limits.',
          '',
          'SIMPLE (recommended): pass brushId or nameContains. The camera centers on that subject.',
          'Optional: view=iso|front|back|top|bottom|left|right (default iso), distanceOffset to pull back.',
          'Example: { "nameContains": "wall_front", "view": "front" }',
          '',
          'Other modes:',
          "- modelId alone → frame that solid model's final CSG mesh",
          '- position + lookAt → free camera',
          '- lookAt alone → camera on view side looking at that point (distanceOffset = distance)',
          '- empty args → frame all solids',
          '',
          'If nameContains matches nothing, the tool errors (does not silently frame the whole map).',
          'shading: solid (default, checker→white), overlap (brush hull overdraw; intersections stack; cutters warm), flat.',
          'size 32–512.',
        ].join(' '),
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'RECOMMENDED. Frame and center this one brush.',
            },
            brushIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Frame and center these brushes together.',
            },
            nameContains: {
              type: 'string',
              description:
                'RECOMMENDED. Frame brushes whose name contains this text (e.g. "wall_front"). Errors if none match.',
            },
            modelId: {
              type: 'string',
              description: "With nameContains: filter model. Alone: frame that solid's final CSG mesh.",
            },
            view: {
              type: 'string',
              enum: ['iso', 'front', 'back', 'top', 'bottom', 'left', 'right'],
              description: 'Camera side for fit/lookAt modes (default iso).',
            },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Free-camera world position (use with lookAt).' },
            lookAt: {
              ...MCP_SCHEMA_VECTOR3,
              description:
                'Point to look at. With brush fit, ignored (always centers framed bounds). Alone: aim camera here.',
            },
            direction: {
              ...MCP_SCHEMA_VECTOR3,
              description: 'Look direction from position when lookAt is omitted (free camera only).',
            },
            distanceOffset: {
              type: 'number',
              description: 'Pull camera farther back after fit, or distance from lookAt when only lookAt is set.',
            },
            padding: { type: 'number', description: 'Fit padding multiplier (default 1.15).' },
            fov: { type: 'number', description: 'Vertical FOV degrees (default 60).' },
            size: {
              type: 'number',
              description: 'Square size (default 256, max 512). Halves down to 32 if still too large for MCP.',
            },
            shading: {
              type: 'string',
              enum: ['solid', 'overlap', 'flat'],
              description:
                'solid = materials (checker→white). overlap = brush volumes with overdraw (intersections brighter; subtractive warm). flat = unlit gray.',
            },
            helpersInclude: {
              type: 'boolean',
              description: 'Include grids/gizmos (default false).',
            },
          },
        },
        mutates: false,
        run: (args) => this.parts.capture.captureView(args as CaptureViewArgs),
      },
    ];
  }
}
