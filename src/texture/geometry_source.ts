import * as THREE from 'three';

/**
 * Primitive geometry identity retained when buffers are expanded for UV seams.
 */
export type GeometrySourceType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'buffer';

/**
 * Snapshot of constructor parameters for a primitive geometry.
 */
export interface GeometrySource {
  type: GeometrySourceType;
  params: Record<string, number>;
}

/** userData key storing GeometrySource on content meshes. */
export const GEOMETRY_SOURCE_USERDATA_KEY = 'geometrySource';

/**
 * Reads a stamped geometry source from mesh or geometry userData.
 * @param target Mesh or geometry to inspect.
 * @returns Geometry source or null.
 */
export function getGeometrySource(
  target: THREE.Mesh | THREE.BufferGeometry
): GeometrySource | null {
  const raw = target.userData[GEOMETRY_SOURCE_USERDATA_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as GeometrySource;
  if (!record.type) return null;
  return {
    type: record.type,
    params: { ...(record.params || {}) }
  };
}

/**
 * Stamps geometry source identity onto mesh and geometry userData.
 * @param mesh Mesh to stamp.
 * @param source Source identity.
 */
export function setGeometrySource(mesh: THREE.Mesh, source: GeometrySource): void {
  const copy: GeometrySource = {
    type: source.type,
    params: { ...source.params }
  };
  mesh.userData[GEOMETRY_SOURCE_USERDATA_KEY] = copy;
  mesh.geometry.userData[GEOMETRY_SOURCE_USERDATA_KEY] = copy;
}

/**
 * Captures typed primitive parameters before the geometry is expanded.
 * No-ops when already stamped or when geometry is not a known primitive.
 * @param mesh Mesh whose geometry may be converted to non-indexed.
 */
export function captureGeometrySourceIfNeeded(mesh: THREE.Mesh): void {
  if (getGeometrySource(mesh) || getGeometrySource(mesh.geometry)) return;
  const source = detectGeometrySourceFromInstance(mesh.geometry);
  if (!source) return;
  setGeometrySource(mesh, source);
}

/**
 * Detects geometry source from a live Three.js typed geometry instance.
 * @param geometry Geometry to inspect.
 * @returns Source snapshot or null for plain buffers.
 */
export function detectGeometrySourceFromInstance(
  geometry: THREE.BufferGeometry
): GeometrySource | null {
  if (geometry instanceof THREE.BoxGeometry) {
    return {
      type: 'box',
      params: {
        width: geometry.parameters.width,
        height: geometry.parameters.height,
        depth: geometry.parameters.depth
      }
    };
  }
  if (geometry instanceof THREE.SphereGeometry) {
    return {
      type: 'sphere',
      params: {
        radius: geometry.parameters.radius,
        widthSegments: geometry.parameters.widthSegments,
        heightSegments: geometry.parameters.heightSegments
      }
    };
  }
  if (geometry instanceof THREE.CylinderGeometry) {
    return {
      type: 'cylinder',
      params: {
        radiusTop: geometry.parameters.radiusTop,
        radiusBottom: geometry.parameters.radiusBottom,
        height: geometry.parameters.height,
        radialSegments: geometry.parameters.radialSegments
      }
    };
  }
  if (geometry instanceof THREE.PlaneGeometry) {
    return {
      type: 'plane',
      params: {
        width: geometry.parameters.width,
        height: geometry.parameters.height
      }
    };
  }
  return null;
}

/**
 * Resolves geometry type for serialization: stamp first, then instanceof.
 * @param geometry Geometry to classify.
 * @returns Geometry source type string.
 */
export function resolveGeometrySourceType(
  geometry: THREE.BufferGeometry
): GeometrySourceType {
  const stamped = getGeometrySource(geometry);
  if (stamped) return stamped.type;
  const detected = detectGeometrySourceFromInstance(geometry);
  if (detected) return detected.type;
  return 'buffer';
}

/**
 * Resolves geometry constructor params for serialization.
 * @param geometry Geometry to inspect.
 * @returns Parameter record (empty for plain buffers).
 */
export function resolveGeometrySourceParams(
  geometry: THREE.BufferGeometry
): Record<string, number> {
  const stamped = getGeometrySource(geometry);
  if (stamped) return { ...stamped.params };
  const detected = detectGeometrySourceFromInstance(geometry);
  if (detected) return { ...detected.params };
  return {};
}
