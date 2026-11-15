import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject, mcpSchemaString } from '@/ai/client/tools/mcp_tool_schema.js';
import { mcpArgumentString } from '@/ai/client/tools/mcp_tool_arguments.js';
import { calculateExpression } from '@/ai/shared/mcp_calculate.js';

/** Arithmetic helper. */
export class McpToolsMath extends McpToolGroup {
  readonly category = 'math';
  readonly summary = 'Arithmetic helper; rarely needed when shapes are described with geometry_scad_build.';

  /**
   * Returns the math tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'math_calculate',
        description:
          'Evaluates an arithmetic expression with + - * / and parentheses, e.g. "20+(0.5*12)" returns 26. Prefer geometry_scad_build, which accepts expressions directly.',
        inputSchema: mcpSchemaObject({ expression: mcpSchemaString('Arithmetic expression, e.g. "(4+2)/2".') }, [
          'expression',
        ]),
        mutates: false,
        run: (args) => calculateExpression(mcpArgumentString(args, 'expression')),
      },
    ];
  }
}
