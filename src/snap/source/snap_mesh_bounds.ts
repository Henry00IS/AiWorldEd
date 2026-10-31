import * as THREE from 'three';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { snapPixelRadiusToWorld } from '@/snap/query/snap_screen_project.js';

/**
 * Returns whether a mesh's world bounds can meet the pointer ray inside the
 * snap radius.
 *
 * @param mesh Mesh to test.
 * @param request Active query.
 * @returns True when the mesh should be searched.
 */
export function meshBoundsNearSnapRay(mesh: THREE.Mesh, request: SnapQueryRequest): boolean {
  const sphere = meshWorldSphere(mesh);
  if (!sphere) {
    return true;
  }
  const along = sphere.center.clone().sub(request.rayOrigin).dot(request.rayDirection);
  if (along < -sphere.radius) {
    return false;
  }
  const slack = snapPixelRadiusToWorld(
    request.camera,
    Math.max(along, 0),
    request.policy.getScreenRadiusPixels(),
    request.viewportHeight,
  );
  const closest = request.rayOrigin.clone().addScaledVector(request.rayDirection, Math.max(along, 0));
  return closest.distanceTo(sphere.center) <= sphere.radius + slack;
}

/**
 * World-space bounding sphere of a mesh.
 *
 * @param mesh Mesh to measure.
 * @returns Center and radius, or null when the mesh has no sphere.
 */
function meshWorldSphere(mesh: THREE.Mesh): { center: THREE.Vector3; radius: number } | null {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) {
    geometry.computeBoundingSphere();
  }
  const sphere = geometry.boundingSphere;
  if (!sphere) {
    return null;
  }
  const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
  const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
  return { center, radius };
}
