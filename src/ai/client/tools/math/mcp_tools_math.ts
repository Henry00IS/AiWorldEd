import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject, mcpSchemaString } from '@/ai/client/tools/mcp_tool_schema.js';
import { mcpArgumentString } from '@/ai/client/tools/mcp_tool_arguments.js';
import { calculateExpression } from '@/ai/shared/mcp_calculate.js';

/** Arithmetic helper. */
export class McpToolsMath extends McpToolGroup {
  readonly category = 'math';
  readonly summary = 'Arithmetic helper; rarely needed when shapes are described with geometry_script_build.';

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
          'Evaluates a formula in the SolidScript formula language: + - * / %, parentheses, PI, functions such as sqrt, sin (degrees), min, max and pow, and vectors such as [1, 2, 3] * 2. E.g. "20+(0.5*12)" returns 26. Prefer geometry_script_build, which accepts formulas directly.',
        inputSchema: mcpSchemaObject({ expression: mcpSchemaString('Formula, e.g. "(4+2)/2" or "sqrt(2) * 3".') }, [
          'expression',
        ]),
        mutates: false,
        run: (args) => calculateExpression(mcpArgumentString(args, 'expression')),
      },
    ];
  }
}
