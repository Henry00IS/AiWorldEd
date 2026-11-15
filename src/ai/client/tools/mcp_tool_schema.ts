import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';

/** JSON Schema of a 3D vector. */
export const MCP_SCHEMA_VECTOR3: McpToolSchema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
};

/** JSON Schema of world-axis bounds. */
export const MCP_SCHEMA_BOUNDS: McpToolSchema = {
  type: 'object',
  properties: { min: MCP_SCHEMA_VECTOR3, max: MCP_SCHEMA_VECTOR3 },
  required: ['min', 'max'],
};

/** JSON Schema of a CSG operation name. */
export const MCP_SCHEMA_OPERATION: McpToolSchema = {
  type: 'string',
  enum: ['additive', 'subtractive', 'intersecting'],
  description: 'CSG operation: additive adds solid, subtractive carves, intersecting keeps only the overlap.',
};

/** Snap override arguments shared by placement tools. */
export const MCP_SCHEMA_SNAP_PROPERTIES: Record<string, McpToolSchema> = {
  snap: {
    type: 'boolean',
    description: 'False skips grid and rotation snapping. Defaults to the editor snap toggle.',
  },
  exact: {
    type: 'boolean',
    description: 'True places values exactly as given (same as snap:false), e.g. -17.125.',
  },
};

/**
 * Builds an object schema.
 *
 * @param properties Property schemas.
 * @param required Required property names.
 * @returns JSON Schema object.
 */
export function mcpSchemaObject(properties: Record<string, McpToolSchema>, required: string[] = []): McpToolSchema {
  return required.length > 0 ? { type: 'object', properties, required } : { type: 'object', properties };
}

/**
 * Builds a string schema with a description.
 *
 * @param description What the string holds.
 * @returns JSON Schema object.
 */
export function mcpSchemaString(description: string): McpToolSchema {
  return { type: 'string', description };
}

/**
 * Builds a number schema with a description.
 *
 * @param description What the number holds.
 * @returns JSON Schema object.
 */
export function mcpSchemaNumber(description: string): McpToolSchema {
  return { type: 'number', description };
}

/**
 * Builds a boolean schema with a description.
 *
 * @param description What the flag does.
 * @returns JSON Schema object.
 */
export function mcpSchemaBoolean(description: string): McpToolSchema {
  return { type: 'boolean', description };
}

/**
 * Builds a string array schema with a description.
 *
 * @param description What the strings hold.
 * @returns JSON Schema object.
 */
export function mcpSchemaStringArray(description: string): McpToolSchema {
  return { type: 'array', items: { type: 'string' }, description };
}

/**
 * Builds a vector schema with a description.
 *
 * @param description What the vector holds.
 * @returns JSON Schema object.
 */
export function mcpSchemaVector3(description: string): McpToolSchema {
  return { ...MCP_SCHEMA_VECTOR3, description };
}
