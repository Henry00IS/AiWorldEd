import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Exports a Three.js scene group to binary GLB format.
 * Uses the Three.js GLTFExporter addon for binary output.
 */
export class GlbExporter {
  /**
   * Exports the given group to a GLB binary buffer.
   * @param worldGroup The root group to export.
   * @returns A promise resolving to the GLB ArrayBuffer.
   */
  export(worldGroup: THREE.Group): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.executeExport(worldGroup, resolve, reject);
    });
  }

  /**
   * Executes the GLTFExporter callback and resolves the promise.
   * @param worldGroup The group to export.
   * @param resolve The promise resolve function.
   * @param reject The promise reject function.
   */
  private executeExport(
    worldGroup: THREE.Group,
    resolve: (buffer: ArrayBuffer) => void,
    reject: (error: Error) => void
  ): void {
    const exporter = new GLTFExporter();
    exporter.parse(
      worldGroup,
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
