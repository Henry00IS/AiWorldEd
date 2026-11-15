import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { McpVec3 } from '@/ai/shared/mcp_protocol_types.js';
import { dtoToVec3, vec3ToDto } from './editor_api_math.js';

/**
 * Returns whether live editor snapping should affect AI transforms.
 *
 * @param host Editor API host.
 * @returns True when snap is enabled.
 */
export function isEditorApiSnapActive(host: EditorApiHost): boolean {
  return host.getUserSnapEnabled() && host.gridSnap.isEnabled();
}

/**
 * Snaps a position vector when snap is active.
 *
 * @param host Editor API host.
 * @param position Position to snap (modified in place).
 * @returns The same position for chaining.
 */
export function snapPositionIfEnabled(host: EditorApiHost, position: THREE.Vector3): THREE.Vector3 {
  if (isEditorApiSnapActive(host)) {
    host.gridSnap.snapWorldPosition(position);
  }
  return position;
}

/**
 * Snaps each Euler component (radians) when snap is active.
 *
 * @param host Editor API host.
 * @param rotation Euler rotation to snap (modified in place).
 * @returns The same rotation for chaining.
 */
export function snapEulerIfEnabled(host: EditorApiHost, rotation: THREE.Euler): THREE.Euler {
  if (!isEditorApiSnapActive(host)) return rotation;
  rotation.x = host.gridSnap.snapAngleRadians(rotation.x);
  rotation.y = host.gridSnap.snapAngleRadians(rotation.y);
  rotation.z = host.gridSnap.snapAngleRadians(rotation.z);
  return rotation;
}

/**
 * Snaps scale components when snap is active.
 *
 * @param host Editor API host.
 * @param scale Scale to snap (modified in place).
 * @returns The same scale for chaining.
 */
export function snapScaleIfEnabled(host: EditorApiHost, scale: THREE.Vector3): THREE.Vector3 {
  if (!isEditorApiSnapActive(host)) return scale;
  scale.x = host.gridSnap.snapScaleFactor(scale.x);
  scale.y = host.gridSnap.snapScaleFactor(scale.y);
  scale.z = host.gridSnap.snapScaleFactor(scale.z);
  return scale;
}

/**
 * Builds a rotation from a degrees vector, or no rotation when it is missing.
 *
 * @param rotationDegrees Euler degrees (XYZ order), or undefined.
 * @returns Euler rotation in radians.
 */
export function resolveEulerFromArgs(rotationDegrees: McpVec3 | undefined): THREE.Euler {
  if (!rotationDegrees) return new THREE.Euler(0, 0, 0, 'XYZ');
  return new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDegrees.x),
    THREE.MathUtils.degToRad(rotationDegrees.y),
    THREE.MathUtils.degToRad(rotationDegrees.z),
    'XYZ',
  );
}

/**
 * Converts Euler rotation to a degrees DTO for AI-friendly responses.
 *
 * @param rotation Euler rotation in radians.
 * @returns Degrees vec3.
 */
export function eulerToDegreesDto(rotation: THREE.Euler): McpVec3 {
  return {
    x: THREE.MathUtils.radToDeg(rotation.x),
    y: THREE.MathUtils.radToDeg(rotation.y),
    z: THREE.MathUtils.radToDeg(rotation.z),
  };
}

/**
 * Builds a position from an optional DTO and snaps when enabled. When dto is
 * omitted, returns a clone of fallback without snapping.
 *
 * @param host Editor API host.
 * @param dto Optional position DTO.
 * @param fallback Fallback position.
 * @param useSnap When false, skips snap even if the editor has snap on.
 * @returns Position vector (optionally snapped).
 */
export function resolveSnappedPosition(
  host: EditorApiHost,
  dto: McpVec3 | undefined,
  fallback: THREE.Vector3,
  useSnap: boolean = true,
): THREE.Vector3 {
  if (!dto) return fallback.clone();
  const position = dtoToVec3(dto, fallback);
  if (!useSnap) return position;
  return snapPositionIfEnabled(host, position);
}

/**
 * Builds a scale from an optional DTO and snaps when enabled. When dto is
 * omitted, returns a clone of fallback without snapping.
 *
 * @param host Editor API host.
 * @param dto Optional scale DTO.
 * @param fallback Fallback scale.
 * @param useSnap When false, skips snap even if the editor has snap on.
 * @returns Scale vector (optionally snapped).
 */
export function resolveSnappedScale(
  host: EditorApiHost,
  dto: McpVec3 | undefined,
  fallback: THREE.Vector3,
  useSnap: boolean = true,
): THREE.Vector3 {
  if (!dto) return fallback.clone();
  const scale = dtoToVec3(dto, fallback);
  if (!useSnap) return scale;
  return snapScaleIfEnabled(host, scale);
}

/**
 * Resolves whether a tool call should apply editor snap. Default true; pass
 * snap:false or exact:true to place values precisely.
 *
 * @param args Tool args that may include snap or exact.
 * @returns True when snapping should run.
 */
export function shouldApplySnap(args: { snap?: boolean; exact?: boolean }): boolean {
  if (args.exact === true) return false;
  if (args.snap === false) return false;
  return true;
}

/**
 * Snaps Euler rotation only when useSnap is true and editor snap is active.
 *
 * @param host Editor API host.
 * @param rotation Euler to snap.
 * @param useSnap Tool-level snap flag.
 * @returns Rotation (possibly snapped).
 */
export function snapEulerWhenRequested(host: EditorApiHost, rotation: THREE.Euler, useSnap: boolean): THREE.Euler {
  if (!useSnap) return rotation;
  return snapEulerIfEnabled(host, rotation);
}

/**
 * Summarizes a mesh TRS for tool results (rotation in degrees).
 *
 * @param mesh Mesh after transform was applied.
 * @returns Compact transform payload.
 */
export function meshTransformSummary(mesh: THREE.Object3D): {
  position: McpVec3;
  rotationDegrees: McpVec3;
  scale: McpVec3;
} {
  return {
    position: vec3ToDto(mesh.position),
    rotationDegrees: eulerToDegreesDto(mesh.rotation),
    scale: vec3ToDto(mesh.scale),
  };
}
