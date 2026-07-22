import * as THREE from 'three';
import { BoundingVolumeComputer } from './bounding_volume_computer.js';
import { FrustumPlanes } from '../types/frustum_planes.js';
import { clampOrthoHalfExtent } from '../viewports/ortho_zoom_limits.js';

/**
 * Computes the target camera positions and frustums needed to frame objects.
 * Delegates actual animation to dedicated animator classes.
 */
export class CameraFramer {
  private boundingVolumeComputer: BoundingVolumeComputer;
  private readonly cornerScratch: THREE.Vector3[];

  /**
   * Creates a new camera framer with a fresh bounding volume computer.
   */
  constructor() {
    this.boundingVolumeComputer = new BoundingVolumeComputer();
    this.cornerScratch = this.createCornerScratchVectors();
  }

  /**
   * Allocates eight vectors used when projecting box corners into camera space.
   * @returns An array of reusable corner vectors.
   */
  private createCornerScratchVectors(): THREE.Vector3[] {
    return Array.from({ length: 8 }, () => new THREE.Vector3());
  }

  /**
   * Computes the target position and look-at point for a perspective camera
   * so that the bounding sphere fits within the viewport.
   * Keeps the current viewing direction and only adjusts distance and focus.
   * @param boundingSphere The sphere enclosing the target objects.
   * @param camera The perspective camera to position.
   * @param paddingFactor The multiplier for extra space around the sphere.
   * @returns An object with targetPosition and targetLookAt vectors.
   */
  computePerspectiveTarget(
    boundingSphere: THREE.Sphere,
    camera: THREE.PerspectiveCamera,
    paddingFactor: number
  ): { targetPosition: THREE.Vector3; targetLookAt: THREE.Vector3 } {
    const targetLookAt = boundingSphere.center.clone();
    const scaledRadius = boundingSphere.radius * paddingFactor;
    const halfFov = camera.fov * 0.5 * (Math.PI / 180);
    const distance = scaledRadius / Math.sin(halfFov);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const targetPosition = targetLookAt.clone().sub(
      forward.multiplyScalar(distance)
    );
    return { targetPosition, targetLookAt };
  }

  /**
   * Computes the target orthographic frustum planes so that the bounding box
   * fits within the viewport with the given padding, in camera view space.
   * Preserves the current aspect ratio of the orthographic frustum.
   * @param boundingBox The axis-aligned bounding box of target objects.
   * @param camera The orthographic camera to adjust.
   * @param paddingFactor The multiplier for extra space around the box.
   * @returns An object with left, right, top, and bottom frustum values.
   */
  computeOrthographicTarget(
    boundingBox: THREE.Box3,
    camera: THREE.OrthographicCamera,
    paddingFactor: number
  ): FrustumPlanes {
    camera.updateMatrixWorld(true);
    const extents = this.computeViewSpaceExtents(boundingBox, camera);
    const paddedWidth = Math.max(extents.width * paddingFactor, 0.001);
    const paddedHeight = Math.max(extents.height * paddingFactor, 0.001);
    const aspect = this.computeFrustumAspect(camera);
    const sized = this.expandExtentsToAspect(paddedWidth, paddedHeight, aspect);
    const halfHeight = clampOrthoHalfExtent(sized.halfHeight);
    const halfWidth = halfHeight * aspect;
    return {
      left: extents.centerX - halfWidth,
      right: extents.centerX + halfWidth,
      top: extents.centerY + halfHeight,
      bottom: extents.centerY - halfHeight
    };
  }

  /**
   * Projects a world-space bounding box into camera view space and measures it.
   * @param boundingBox The world-space axis-aligned box.
   * @param camera The orthographic camera defining view space.
   * @returns Center and size of the projected extents in view X/Y.
   */
  private computeViewSpaceExtents(
    boundingBox: THREE.Box3,
    camera: THREE.OrthographicCamera
  ): { centerX: number; centerY: number; width: number; height: number } {
    this.fillBoxCorners(boundingBox);
    const inverse = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    this.cornerScratch.forEach((corner) => {
      corner.applyMatrix4(inverse);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    });
    return {
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Writes the eight corners of a bounding box into the scratch array.
   * @param boundingBox The box whose corners are needed.
   */
  private fillBoxCorners(boundingBox: THREE.Box3): void {
    const min = boundingBox.min;
    const max = boundingBox.max;
    this.cornerScratch[0].set(min.x, min.y, min.z);
    this.cornerScratch[1].set(min.x, min.y, max.z);
    this.cornerScratch[2].set(min.x, max.y, min.z);
    this.cornerScratch[3].set(min.x, max.y, max.z);
    this.cornerScratch[4].set(max.x, min.y, min.z);
    this.cornerScratch[5].set(max.x, min.y, max.z);
    this.cornerScratch[6].set(max.x, max.y, min.z);
    this.cornerScratch[7].set(max.x, max.y, max.z);
  }

  /**
   * Reads the aspect ratio of the current orthographic frustum.
   * @param camera The orthographic camera.
   * @returns Width over height, or 1 when the frustum is degenerate.
   */
  private computeFrustumAspect(camera: THREE.OrthographicCamera): number {
    const width = camera.right - camera.left;
    const height = camera.top - camera.bottom;
    if (height === 0) return 1;
    return width / height;
  }

  /**
   * Expands a content size so it fills the viewport without cropping,
   * while matching the given aspect ratio.
   * @param contentWidth Content width in view space.
   * @param contentHeight Content height in view space.
   * @param aspect Desired frustum aspect ratio (width / height).
   * @returns Half-width and half-height for the final frustum.
   */
  private expandExtentsToAspect(
    contentWidth: number,
    contentHeight: number,
    aspect: number
  ): { halfWidth: number; halfHeight: number } {
    let halfWidth = contentWidth * 0.5;
    let halfHeight = contentHeight * 0.5;
    const contentAspect = halfWidth / halfHeight;
    if (contentAspect > aspect) {
      halfHeight = halfWidth / aspect;
    } else {
      halfWidth = halfHeight * aspect;
    }
    return { halfWidth, halfHeight };
  }
}
