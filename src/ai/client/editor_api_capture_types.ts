import type { McpVec3 } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Shading styles for offline AI world captures. overlap = brush hull overdraw
 * (intersections stack brighter; cutters warm).
 */
export type CaptureViewShading = 'solid' | 'overlap' | 'flat';

/** Named camera side for fit framing. Default is isometric (1,1,1 diagonal). */
export type CaptureViewSide = 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/**
 * Arguments for capture_view.
 *
 * Prefer the simple path: brushId / nameContains (optional view,
 * distanceOffset). Free camera path: position + lookAt.
 */
export interface CaptureViewArgs {
  /** Frame this one brush and center the camera on it (recommended). */
  brushId?: string;
  /** Frame these brushes together and center on their combined bounds. */
  brushIds?: string[];
  /** Frame all brushes whose name contains this text (case-insensitive). */
  nameContains?: string;
  /**
   * When framing by nameContains, only search this solid model. Alone (no brush
   * filters), frames the whole model's final CSG solid.
   */
  modelId?: string;
  /**
   * Camera side for fit framing: iso (default), front, back, top, bottom, left,
   * right.
   */
  view?: CaptureViewSide;
  /** Explicit world-space camera position (free camera mode). */
  position?: McpVec3;
  /**
   * World point the camera looks at. With brush fit, ignored (always centers
   * the framed bounds). Alone, places an iso/view camera looking at this
   * point.
   */
  lookAt?: McpVec3;
  /** World look direction from position when lookAt is omitted (free camera). */
  direction?: McpVec3;
  /**
   * Extra world units to pull the camera back after framing (or camera distance
   * from lookAt when only lookAt is set).
   */
  distanceOffset?: number;
  /** Fit padding multiplier (default 1.15). Values below 1 clamp to 1. */
  padding?: number;
  /** Vertical field of view in degrees (default 60). */
  fov?: number;
  /**
   * Preferred square resolution in pixels (default 256, max 512). May half down
   * to 32 for MCP size limits.
   */
  size?: number;
  /** Solid | overlap | flat (default solid). Legacy wireframe maps to overlap. */
  shading?: CaptureViewShading;
  /** Include grids/gizmos (default false). */
  includeHelpers?: boolean;
  /**
   * Lossless PNG at the full requested size instead of a small JPEG; set by the
   * MCP bridge when captures are delivered as links.
   */
  lossless?: boolean;
}

/** Metadata returned with a successful capture (image is separate MCP content). */
export interface CaptureViewData {
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
  shading: CaptureViewShading;
  camera: {
    position: McpVec3;
    lookAt: McpVec3;
    fov: number;
  };
  framedBrushIds: string[];
  framedBrushCount: number;
  /** Framing mode used: brush_fit | model_fit | world_fit | free | look_at. */
  framingMode: string;
  /** Decoded image byte length. */
  imageBytes: number;
  /** JPEG quality used for encoding (0–1); 1 for lossless PNG. */
  jpegQuality: number;
  /** True when size or quality was reduced to fit MCP size limits. */
  compressedForMcp: boolean;
}
