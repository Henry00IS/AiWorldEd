/** JSON-RPC 2.0 request shape. */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 success response. */
export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

/** Union of JSON-RPC response types. */
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/**
 * Parses a JSON body into a JSON-RPC request.
 *
 * @param body Parsed JSON value.
 * @returns Request or null when invalid.
 */
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record['jsonrpc'] !== '2.0') return null;
  const method = record['method'];
  if (typeof method !== 'string' || method.length === 0) return null;
  const request: JsonRpcRequest = { jsonrpc: '2.0', method };
  const id = normalizeId(record['id']);
  if (id !== undefined) request.id = id;
  if (Object.prototype.hasOwnProperty.call(record, 'params')) request.params = record['params'];
  return request;
}

/**
 * Builds a JSON-RPC success response.
 *
 * @param id Request id.
 * @param result Result payload.
 * @returns Success response.
 */
export function jsonRpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Builds a JSON-RPC error response.
 *
 * @param id Request id.
 * @param code Error code.
 * @param message Error message.
 * @param data Optional error data.
 * @returns Error response.
 */
export function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcError {
  const error: JsonRpcError['error'] = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

/**
 * Returns whether the request is a notification (no response expected).
 *
 * @param request JSON-RPC request.
 * @returns True when id is omitted.
 */
export function isJsonRpcNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined;
}

/**
 * Normalizes a JSON-RPC id field.
 *
 * @param value Raw id value.
 * @returns Normalized id or undefined when absent.
 */
function normalizeId(value: unknown): string | number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return null;
}
