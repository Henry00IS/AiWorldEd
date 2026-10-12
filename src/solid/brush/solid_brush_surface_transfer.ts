import { SolidBrush } from './solid_brush.js';
import { SolidPlane } from './solid_plane.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import {
  FaceSurfaceDescription,
  cloneFaceSurface,
  createDefaultFaceSurface,
  orientDefaultFaceSurface,
} from '@/texture/uv_matrix/face_surface_description.js';

/**
 * Transfers per-face UV surfaces from a source brush onto a destination brush
 * by matching plane equations (normal + offset). Clip/split recreate topology
 * so face indices change; coplanar survivors keep their UV matrices. Unmatched
 * faces (clip caps) receive a default face-oriented UV matrix.
 *
 * @param sourceBrush Geometry that owned the source surfaces.
 * @param sourceDefault Default surface on the source instance.
 * @param sourceFaceSurfaces Sparse per-face surfaces from the source instance.
 * @param destinationBrush New clipped/split geometry.
 * @returns Default surface and sparse face surfaces for the destination.
 */
export function transferSurfacesByPlaneMatch(
  sourceBrush: SolidBrush,
  sourceDefault: FaceSurfaceDescription,
  sourceFaceSurfaces: (FaceSurfaceDescription | undefined)[],
  destinationBrush: SolidBrush,
): {
  defaultSurface: FaceSurfaceDescription;
  faceSurfaces: (FaceSurfaceDescription | undefined)[];
} {
  const defaultSurface = cloneFaceSurface(sourceDefault);
  const faceSurfaces: (FaceSurfaceDescription | undefined)[] = [];
  const destinationFaceCount = destinationBrush.faces.length;
  for (let destIndex = 0; destIndex < destinationFaceCount; destIndex++) {
    const destPlane = destinationBrush.planes[destIndex];
    if (!destPlane) {
      faceSurfaces[destIndex] = createDefaultFaceSurface(defaultSurface.textureId);
      continue;
    }
    const sourceIndex = findMatchingSourceFaceIndex(sourceBrush, destPlane);
    if (sourceIndex < 0) {
      faceSurfaces[destIndex] = orientDefaultFaceSurface(defaultSurface, destPlane.normal);
      continue;
    }
    const override = sourceFaceSurfaces[sourceIndex];
    if (override) {
      faceSurfaces[destIndex] = cloneFaceSurface(override);
    } else {
      // Leave hole so destination uses default (re-oriented per face on read).
      faceSurfaces[destIndex] = undefined;
    }
  }
  return { defaultSurface, faceSurfaces };
}

/**
 * Applies plane-matched surface transfer onto a brush instance after its
 * geometry has been replaced.
 *
 * @param instance Brush instance already holding the new geometry.
 * @param sourceBrush Previous geometry (for plane matching).
 * @param sourceDefault Previous default surface.
 * @param sourceFaceSurfaces Previous sparse face surfaces.
 */
export function applyTransferredSurfacesToInstance(
  instance: SolidBrushInstance,
  sourceBrush: SolidBrush,
  sourceDefault: FaceSurfaceDescription,
  sourceFaceSurfaces: (FaceSurfaceDescription | undefined)[],
): void {
  const transferred = transferSurfacesByPlaneMatch(sourceBrush, sourceDefault, sourceFaceSurfaces, instance.brush);
  instance.restoreFaceSurfaces(transferred.defaultSurface, transferred.faceSurfaces);
}

/**
 * Captures default + sparse face surfaces from an instance for clip/split undo.
 *
 * @param instance Brush instance.
 * @returns Serializable surface snapshot.
 */
export function captureInstanceFaceSurfaces(instance: SolidBrushInstance): {
  defaultSurface: ReturnType<SolidBrushInstance['serializeDefaultSurface']>;
  faceSurfaces: ReturnType<SolidBrushInstance['serializeFaceSurfaces']>;
} {
  return {
    defaultSurface: instance.serializeDefaultSurface(),
    faceSurfaces: instance.serializeFaceSurfaces(),
  };
}

/**
 * Finds a source face whose plane matches the destination plane.
 *
 * @param sourceBrush Source geometry.
 * @param destinationPlane Destination face plane.
 * @returns Source face index, or -1 when none match.
 */
function findMatchingSourceFaceIndex(sourceBrush: SolidBrush, destinationPlane: SolidPlane): number {
  for (let sourceIndex = 0; sourceIndex < sourceBrush.planes.length; sourceIndex++) {
    const sourcePlane = sourceBrush.planes[sourceIndex];
    if (sourcePlane && sourcePlane.isAlignedWith(destinationPlane)) {
      return sourceIndex;
    }
  }
  return -1;
}
