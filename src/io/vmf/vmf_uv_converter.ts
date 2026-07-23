import * as THREE from 'three';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../../texture/face_texture_mapping.js';
import {
  VMF_INCHES_TO_METERS,
  swizzleSourceComponentsToThree
} from './vmf_coordinates.js';
import { VmfTextureAxis } from './vmf_types.js';
import { materialNameToTextureId } from './vmf_material_policy.js';

/**
 * Default texture size used when VMT/VTF dimensions are unknown.
 * Half-Life 2 materials are commonly 512²; UV phase remains correct for any
 * power-of-two size that matches the eventual loaded texture.
 */
export const VMF_DEFAULT_TEXTURE_SIZE = 512;

/**
 * Converts Hammer U/V axes into a face texture mapping approximation.
 * Exact VMF UVs use independent non-orthonormal axes; the editor projects
 * with an orthonormal face-plane basis, so scale/offset/rotation are fitted.
 */
export class VmfUvConverter {
  /**
   * Builds a face mapping from one side's U/V axes and material name.
   * @param materialName VMF material path.
   * @param uAxis Hammer U axis.
   * @param vAxis Hammer V axis.
   * @param faceNormal Outward face normal in editor space (for rotation fit).
   * @param textureWidth Assumed texture width in texels.
   * @param textureHeight Assumed texture height in texels.
   * @param unitScale Inches to meters.
   * @returns Face texture mapping for the solid brush face.
   */
  convertSideMapping(
    materialName: string,
    uAxis: VmfTextureAxis,
    vAxis: VmfTextureAxis,
    faceNormal: THREE.Vector3,
    textureWidth: number = VMF_DEFAULT_TEXTURE_SIZE,
    textureHeight: number = VMF_DEFAULT_TEXTURE_SIZE,
    unitScale: number = VMF_INCHES_TO_METERS
  ): FaceTextureMapping {
    const mapping = createDefaultFaceTextureMapping(
      materialNameToTextureId(materialName)
    );
    mapping.align = 'face';
    mapping.scaleU = this.axisToMetersPerTile(uAxis, textureWidth, unitScale);
    mapping.scaleV = this.axisToMetersPerTile(vAxis, textureHeight, unitScale);
    mapping.offsetU = this.axisToMeterOffset(uAxis, unitScale);
    mapping.offsetV = this.axisToMeterOffset(vAxis, unitScale);
    mapping.rotationDeg = this.estimateRotationDegrees(uAxis, faceNormal);
    return mapping;
  }

  /**
   * World meters covered by one full texture tile along a VMF axis.
   * @param axis Hammer texture axis.
   * @param textureSize Texels along that UV dimension.
   * @param unitScale Inches to meters.
   * @returns Positive scale in meters per tile.
   */
  private axisToMetersPerTile(
    axis: VmfTextureAxis,
    textureSize: number,
    unitScale: number
  ): number {
    const scale = axis.scale === 0 ? 0.25 : Math.abs(axis.scale);
    const meters = textureSize * scale * unitScale;
    return meters > 1e-8 ? meters : 1;
  }

  /**
   * Converts Hammer texel translation into a world-space UV offset in meters.
   * @param axis Hammer texture axis.
   * @param unitScale Inches to meters.
   * @returns Offset matching projectWorldPositionToUv conventions.
   */
  private axisToMeterOffset(axis: VmfTextureAxis, unitScale: number): number {
    const scale = axis.scale === 0 ? 0.25 : axis.scale;
    return -axis.translation * scale * unitScale;
  }

  /**
   * Estimates projection rotation so the built-in U seed aligns with the
   * swizzled Hammer U axis as closely as possible.
   * @param uAxis Hammer U axis.
   * @param faceNormal Outward face normal in editor space.
   * @returns Rotation in degrees around the face normal.
   */
  private estimateRotationDegrees(
    uAxis: VmfTextureAxis,
    faceNormal: THREE.Vector3
  ): number {
    const desiredU = swizzleSourceComponentsToThree(uAxis.x, uAxis.y, uAxis.z);
    if (desiredU.lengthSq() < 1e-12) return 0;
    desiredU.normalize();
    const normal = faceNormal.clone().normalize();
    const projected = this.projectOntoPlane(desiredU, normal);
    if (!projected) return 0;
    return this.angleFromSeedU(projected, normal);
  }

  /**
   * Projects a direction onto a plane and normalizes it.
   * @param direction Direction in editor space.
   * @param normal Unit plane normal.
   * @returns Unit in-plane vector, or null when degenerate.
   */
  private projectOntoPlane(
    direction: THREE.Vector3,
    normal: THREE.Vector3
  ): THREE.Vector3 | null {
    const projected = direction
      .clone()
      .addScaledVector(normal, -direction.dot(normal));
    if (projected.lengthSq() < 1e-12) return null;
    return projected.normalize();
  }

  /**
   * Measures rotation from the stable U seed to a desired in-plane U.
   * @param projected Desired unit U on the plane.
   * @param normal Face normal.
   * @returns Degrees around the normal.
   */
  private angleFromSeedU(
    projected: THREE.Vector3,
    normal: THREE.Vector3
  ): number {
    const seedU = this.pickStableUAxis(normal);
    const seedV = new THREE.Vector3().crossVectors(normal, seedU).normalize();
    const cos = THREE.MathUtils.clamp(seedU.dot(projected), -1, 1);
    const sin = seedV.dot(projected);
    return THREE.MathUtils.radToDeg(Math.atan2(sin, cos));
  }

  /**
   * Mirrors planar_uv_projector U seed selection for rotation fitting.
   * @param normal Projection normal.
   * @returns Unit U seed.
   */
  private pickStableUAxis(normal: THREE.Vector3): THREE.Vector3 {
    if (Math.abs(normal.y) > 0.9) {
      return new THREE.Vector3(1, 0, 0);
    }
    const horizontal = new THREE.Vector3().crossVectors(
      new THREE.Vector3(0, 1, 0),
      normal
    );
    if (horizontal.lengthSq() < 1e-12) {
      return new THREE.Vector3(1, 0, 0);
    }
    return horizontal.normalize();
  }
}
