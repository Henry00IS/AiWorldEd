/**
 * Parsed Valve Map Format 2006 (Source Engine) data structures.
 * Coordinates in these types remain in Source space (Z-up, inches)
 * until conversion for the solid model.
 */

/**
 * Three-component vector from a VMF file.
 */
export interface VmfVector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Plane defined by three points on the face (Source winding).
 */
export interface VmfPlanePoints {
  p1: VmfVector3;
  p2: VmfVector3;
  p3: VmfVector3;
}

/**
 * Texture axis: direction, texel translation, and scale (texels per unit).
 */
export interface VmfTextureAxis {
  x: number;
  y: number;
  z: number;
  translation: number;
  scale: number;
}

/**
 * Optional displacement info on a solid side (imported as base brush only).
 */
export interface VmfDisplacementInfo {
  power: number;
  startPosition: VmfVector3;
  elevation: number;
  subdivide: number;
}

/**
 * One face of a Hammer solid (side block).
 */
export interface VmfSolidSide {
  id: number;
  plane: VmfPlanePoints;
  material: string;
  rotation: number;
  uAxis: VmfTextureAxis;
  vAxis: VmfTextureAxis;
  lightmapScale: number;
  smoothingGroups: number;
  displacement: VmfDisplacementInfo | null;
}

/**
 * Convex solid defined by bounding planes (sides).
 */
export interface VmfSolid {
  id: number;
  sides: VmfSolidSide[];
}

/**
 * Entity with optional brush solids and keyvalues.
 */
export interface VmfEntity {
  id: number;
  className: string;
  solids: VmfSolid[];
  properties: Record<string, string | number | VmfVector3>;
}

/**
 * Root world block plus entities from a VMF document.
 */
export interface VmfWorld {
  versionInfoEditorVersion: number;
  versionInfoEditorBuild: number;
  versionInfoMapVersion: number;
  versionInfoFormatVersion: number;
  versionInfoPrefab: number;
  viewSettingsSnapToGrid: number;
  viewSettingsShowGrid: number;
  viewSettingsShowLogicalGrid: number;
  viewSettingsGridSpacing: number;
  viewSettingsShow3DGrid: number;
  id: number;
  mapVersion: number;
  className: string;
  detailMaterial: string;
  detailVBsp: string;
  maxPropScreenWidth: number;
  skyName: string;
  solids: VmfSolid[];
  entities: VmfEntity[];
}

/**
 * Creates an empty VMF world with unset numeric fields at -1.
 * @returns Fresh world document.
 */
export function createEmptyVmfWorld(): VmfWorld {
  return {
    versionInfoEditorVersion: -1,
    versionInfoEditorBuild: -1,
    versionInfoMapVersion: -1,
    versionInfoFormatVersion: -1,
    versionInfoPrefab: -1,
    viewSettingsSnapToGrid: -1,
    viewSettingsShowGrid: -1,
    viewSettingsShowLogicalGrid: -1,
    viewSettingsGridSpacing: -1,
    viewSettingsShow3DGrid: -1,
    id: -1,
    mapVersion: -1,
    className: '',
    detailMaterial: '',
    detailVBsp: '',
    maxPropScreenWidth: -1,
    skyName: '',
    solids: [],
    entities: []
  };
}

/**
 * Creates a default texture axis along +X with unit scale.
 * @returns Default U-style axis.
 */
export function createDefaultVmfTextureAxis(): VmfTextureAxis {
  return { x: 1, y: 0, z: 0, translation: 0, scale: 0.25 };
}
