/** JSON Schema object describing the arguments of one MCP tool. */
export type McpToolSchema = Record<string, unknown>;

/** One entry of the MCP tools/list answer. */
export interface McpToolDefinition {
  /** Tool name: category first, then the specific subject, then the verb. */
  name: string;
  /** What the tool does, as shown to AI clients. */
  description: string;
  /** JSON Schema of the tool arguments. */
  inputSchema: McpToolSchema;
}
