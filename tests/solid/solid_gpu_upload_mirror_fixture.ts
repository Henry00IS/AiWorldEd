import * as THREE from 'three';

/** What the GPU holds for one attribute: its array copy and uploaded version. */
interface SolidGpuUploadMirrorEntry {
  uploaded: Float32Array;
  version: number;
}

/**
 * Mirrors how the WebGL renderer uploads result geometry attributes: a new
 * attribute is uploaded whole; a changed attribute uploads only the update
 * ranges waiting on it (or everything when none wait), and the ranges are then
 * cleared. Comparing the mirror with the attribute arrays shows whether the
 * screen would draw stale triangles.
 */
export class SolidGpuUploadMirror {
  private readonly entries = new WeakMap<THREE.BufferAttribute, SolidGpuUploadMirrorEntry>();

  /**
   * Uploads the position attribute of a mesh the way one draw call would.
   *
   * @param mesh Drawn mesh.
   */
  draw(mesh: THREE.Mesh): void {
    const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const entry = this.entries.get(attribute);
    if (!entry) {
      this.entries.set(attribute, { uploaded: (attribute.array as Float32Array).slice(), version: attribute.version });
      return;
    }
    if (entry.version >= attribute.version) return;
    this.uploadChangedAttribute(attribute, entry);
  }

  /**
   * Returns the triangles the GPU would draw, as sorted text keys.
   *
   * @param mesh Drawn mesh.
   * @returns Sorted triangle keys from the uploaded copy.
   */
  drawnTriangleKeys(mesh: THREE.Mesh): string[] {
    const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const uploaded = this.entries.get(attribute)?.uploaded ?? (attribute.array as Float32Array);
    return SolidGpuUploadMirror.triangleKeys(uploaded, attribute.count);
  }

  /**
   * Returns the triangles held by the attribute array, as sorted text keys.
   *
   * @param mesh Result mesh.
   * @returns Sorted triangle keys from the CPU array.
   */
  static cpuTriangleKeys(mesh: THREE.Mesh): string[] {
    const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    return SolidGpuUploadMirror.triangleKeys(attribute.array as Float32Array, attribute.count);
  }

  /**
   * Copies the waiting ranges (or the whole array) into the uploaded copy.
   *
   * @param attribute Changed attribute.
   * @param entry Mirror entry of that attribute.
   */
  private uploadChangedAttribute(attribute: THREE.BufferAttribute, entry: SolidGpuUploadMirrorEntry): void {
    const array = attribute.array as Float32Array;
    if (attribute.updateRanges.length === 0) {
      entry.uploaded.set(array);
    } else {
      for (const range of attribute.updateRanges)
        entry.uploaded.set(array.subarray(range.start, range.start + range.count), range.start);
      attribute.clearUpdateRanges();
    }
    entry.version = attribute.version;
  }

  /**
   * Formats triangles of a position array as sorted text keys.
   *
   * @param positions Position floats.
   * @param vertexCount Vertex count.
   * @returns Sorted keys, one per triangle.
   */
  private static triangleKeys(positions: Float32Array, vertexCount: number): string[] {
    const keys: string[] = [];
    for (let vertex = 0; vertex + 2 < vertexCount; vertex += 3) {
      const corners = [0, 1, 2].map((corner) => {
        const offset = (vertex + corner) * 3;
        const coordinates = Array.from(positions.subarray(offset, offset + 3));
        return coordinates.map((coordinate) => coordinate.toFixed(4)).join(',');
      });
      keys.push(corners.join(';'));
    }
    return keys.sort();
  }
}
