import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { GameProfile } from '../settings/settings_types.js';
import { buildExportRootTransform } from './coordinate_space_transform.js';

/**
 * Exports a Three.js scene group to binary GLB format.
 * Bakes the active game profile's unit scale and coordinate space
 * conversion onto a wrapping root group before invoking GLTFExporter.
 * Attribute buffers remain unmodified. Left-handed targets therefore retain
 * a negative-determinant root transform; consumers that bake this transform
 * into geometry must reverse triangle winding and transform normals with the
 * inverse-transpose matrix.
 */
export class GlbExporter {
  /**
   * Exports the given group to a GLB binary buffer.
   * @param worldGroup The root group to export.
   * @param profile Active game profile, or null to skip the conversion.
   * @returns A promise resolving to the GLB ArrayBuffer.
   */
  export(
    worldGroup: THREE.Group,
    profile: GameProfile | null = null
  ): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const exportRoot = this.wrapForExport(worldGroup, profile);
      this.executeExport(exportRoot, resolve, reject);
    });
  }

  /**
   * Builds a temporary root group carrying the profile transform so the
   * original world group remains untouched. The exporter releases the
   * temporary parent by clearing it once parsing completes.
   * @param worldGroup The original scene root.
   * @param profile Active game profile, or null.
   * @returns A wrapped group ready for GLTFExporter.
   */
  private wrapForExport(
    worldGroup: THREE.Group,
    profile: GameProfile | null
  ): THREE.Group {
    const transform = buildExportRootTransform(profile);
    if (transform.equals(new THREE.Matrix4())) {
      return worldGroup.clone(true);
    }
    const wrapper = new THREE.Group();
    wrapper.name = 'ExportRoot';
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.copy(transform);
    wrapper.add(worldGroup.clone(true));
    return wrapper;
  }

  /**
   * Executes the GLTFExporter callback and resolves the promise.
   * @param exportRoot The group to export.
   * @param resolve The promise resolve function.
   * @param reject The promise reject function.
   */
  private executeExport(
    exportRoot: THREE.Group,
    resolve: (buffer: ArrayBuffer) => void,
    reject: (error: Error) => void
  ): void {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportRoot,
      (result) => this.onExportSuccess(result, resolve),
      (error) => this.onExportError(error, reject),
      { binary: true }
    );
  }

  /**
   * Handles successful export by resolving with the result buffer.
   * @param result The export result, expected to be an ArrayBuffer.
   * @param resolve The promise resolve function.
   */
  private onExportSuccess(
    result: ArrayBuffer | object,
    resolve: (buffer: ArrayBuffer) => void
  ): void {
    if (result instanceof ArrayBuffer) {
      resolve(result);
    } else {
      resolve(new ArrayBuffer(0));
    }
  }

  /**
   * Handles export errors by rejecting with the error message.
   * @param error The error thrown by GLTFExporter.
   * @param reject The promise reject function.
   */
  private onExportError(
    error: unknown,
    reject: (error: Error) => void
  ): void {
    if (error instanceof Error) {
      reject(error);
    } else {
      reject(new Error(String(error)));
    }
  }
}
