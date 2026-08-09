import * as THREE from 'three';
import type { FaceSelection } from '@/selection/face/manager_face_selection.js';
import { groupSelectionsIntoFaceRegions } from '@/selection/face/face_region_grouper.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
} from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/** One selected face region with its baseline mapping for a UV transform. */
export interface UvTransformRegionTarget {
  /** Mesh owning the region. */
  mesh: THREE.Mesh;
  /** Triangle indices for the coplanar region. */
  triangleIndices: number[];
  /** Mapping snapshot at session begin. */
  baselineMapping: FaceTextureMapping;
  /** World-space face normal for the region. */
  worldNormal: THREE.Vector3;
}

/**
 * Builds UV transform targets from the current face selection.
 *
 * @param selections Active face selection seeds.
 * @returns One target per coplanar region.
 */
export function buildUvTransformTargetsFromFaceSelection(selections: FaceSelection[]): UvTransformRegionTarget[] {
  const regions = groupSelectionsIntoFaceRegions(selections);
  return regions.map((region) => buildOneRegionTarget(region.mesh, region.faceIndices));
}

/**
 * Builds a single region target with baseline mapping.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Transform target.
 */
function buildOneRegionTarget(mesh: THREE.Mesh, triangleIndices: number[]): UvTransformRegionTarget {
  const worldNormal = computeRegionWorldNormal(mesh, triangleIndices);
  const baselineMapping = resolveBaselineMapping(mesh, triangleIndices);
  return {
    mesh,
    triangleIndices: triangleIndices.slice(),
    baselineMapping,
    worldNormal,
  };
}

/**
 * Reads the stored mapping for a region, or creates a default mapping.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Cloned baseline mapping.
 */
function resolveBaselineMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping {
  const existing = findExactOrOverlappingMapping(mesh, triangleIndices);
  if (existing) {
    return existing;
  }
  return createDefaultFaceTextureMapping(DEFAULT_CHECKER_TEXTURE_ID);
}

/**
 * Finds a stored map entry that matches or overlaps the region.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Mapping clone, or null.
 */
function findExactOrOverlappingMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping | null {
  const key = sortedTriangleKey(triangleIndices);
  const regionSet = new Set(triangleIndices);
  let overlapping: FaceTextureMapping | null = null;
  for (const entry of getFaceTextureMaps(mesh)) {
    if (sortedTriangleKey(entry.triangleIndices) === key) {
      return cloneFaceTextureMapping(entry.mapping);
    }
    if (!overlapping && entry.triangleIndices.some((index) => regionSet.has(index))) {
      overlapping = cloneFaceTextureMapping(entry.mapping);
    }
  }
  return overlapping;
}

/**
 * Builds a stable sorted key for a triangle index list.
 *
 * @param triangleIndices Triangle indices.
 * @returns Comma-separated key.
 */
function sortedTriangleKey(triangleIndices: number[]): string {
  return triangleIndices
    .slice()
    .sort((a, b) => a - b)
    .join(',');
}
