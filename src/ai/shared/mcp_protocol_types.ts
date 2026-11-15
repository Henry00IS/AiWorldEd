/** Detail level for solid model / brush tool responses. */
export type McpDetailLevel = 'summary' | 'full';

/** CSG operation labels exchanged over MCP (string form of SolidOperation). */
export type McpSolidOperationName = 'additive' | 'subtractive' | 'intersecting';

/** Brush reorder ends matching the editor command. */
export type McpBrushOrderEnd = 'first' | 'last';

/** JSON vector DTO used at the MCP / EditorApi boundary. */
export interface McpVec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounds as min/max corners. */
export interface McpBounds {
  min: McpVec3;
  max: McpVec3;
}

/** One image payload returned by a tool (MCP image content block source). */
export interface McpImagePayload {
  /** IANA mime type, e.g. image/png. */
  mimeType: string;
  /** Raw base64 image bytes without a data-URL prefix. */
  data: string;
}

/**
 * Why a shared-room edit did not apply: another member edits an affected object
 * (locked), the room is not ready or connected (offline), or the relay refused
 * the edit (rejected).
 */
/**
 * Collaboration refusal codes: `locked` another member's edit lease covers the
 * object, `busy` this member's own operation is still running (one operation at
 * a time), `deleted` the object no longer exists, `offline` not synced,
 * `rejected` the relay refused the edit.
 */
export type McpToolErrorCode = 'locked' | 'busy' | 'deleted' | 'offline' | 'rejected';

/** Result envelope for every EditorApi tool invocation. */
export interface McpToolResult {
  ok: boolean;
  message: string;
  /** Machine-readable failure reason of a collaboration refusal. */
  error?: McpToolErrorCode;
  /** Name of the object the refusal is about. */
  object?: string;
  /** Display name of the member holding the object. */
  holder?: string;
  data?: unknown;
  createdIds?: string[];
  warnings?: string[];
  /**
   * Optional images returned as MCP image content blocks (not duplicated in
   * text).
   */
  images?: McpImagePayload[];
  /**
   * Images the MCP host serves as loopback links instead of content blocks
   * (localhost delivery mode).
   */
  files?: McpImagePayload[];
  /** Download links of delivered images. */
  links?: string[];
}

/** Live MCP host status returned to the desktop UI. */
export interface McpHostStatus {
  running: boolean;
  port: number | null;
  url: string | null;
}

/** Payload returned when the MCP host starts successfully. */
export interface McpHostStartResult {
  ok: boolean;
  message: string;
  status: McpHostStatus;
}

/** Arguments for Bun → webview tool invocation. */
export interface McpInvokeEditorToolParams {
  name: string;
  arguments: Record<string, unknown>;
}
