import * as THREE from 'three';

/** Initial float capacity for position and color streams (multiple of 6). */
const INITIAL_FLOAT_CAPACITY = 4096;

/** Growable line-segment buffer with per-vertex colors for grid rendering. */
export class GridLineBuffer {
  private positionData: Float32Array;
  private colorData: Float32Array;
  private positionFloatCount: number;
  private colorFloatCount: number;
  private positionAttribute: THREE.BufferAttribute;
  private colorAttribute: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private lineSegments: THREE.LineSegments;

  /** Creates an empty line buffer ready for per-frame rebuilds. */
  constructor() {
    this.positionFloatCount = 0;
    this.colorFloatCount = 0;
    this.positionData = new Float32Array(INITIAL_FLOAT_CAPACITY);
    this.colorData = new Float32Array(INITIAL_FLOAT_CAPACITY);
    this.positionAttribute = new THREE.BufferAttribute(this.positionData, 3);
    this.colorAttribute = new THREE.BufferAttribute(this.colorData, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      depthWrite: false,
    });
    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;
    this.lineSegments.name = 'grid_lines';
  }

  /**
   * Returns the LineSegments object to add to a scene.
   *
   * @returns The line segments mesh.
   */
  getObject(): THREE.LineSegments {
    return this.lineSegments;
  }

  /**
   * Enables or disables depth testing on the line material.
   *
   * @param enabled True to compare against the depth buffer.
   */
  setDepthTest(enabled: boolean): void {
    this.material.depthTest = enabled;
  }

  /**
   * Sets the render order on the line segments object.
   *
   * @param renderOrder Lower values draw earlier (behind higher-order content).
   */
  setRenderOrder(renderOrder: number): void {
    this.lineSegments.renderOrder = renderOrder;
  }

  /** Resets write cursors for a new frame without discarding capacity. */
  beginFrame(): void {
    this.positionFloatCount = 0;
    this.colorFloatCount = 0;
  }

  /**
   * Appends a colored line segment between two points by writing directly into
   * preallocated typed arrays (no intermediate JS number arrays).
   *
   * @param ax Start X.
   * @param ay Start Y.
   * @param az Start Z.
   * @param bx End X.
   * @param by End Y.
   * @param bz End Z.
   * @param colorA Start vertex color.
   * @param colorB End vertex color.
   */
  addLine(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    colorA: THREE.Color,
    colorB: THREE.Color,
  ): void {
    this.ensureCapacity(this.positionFloatCount + 6, this.colorFloatCount + 6);
    this.writeEndpointPositions(ax, ay, az, bx, by, bz);
    this.writeEndpointColors(colorA, colorB);
  }

  /**
   * Marks GPU attributes dirty and applies the live draw range for the current
   * frame.
   */
  endFrame(): void {
    this.setDynamicAttributeCount(this.positionAttribute, this.positionFloatCount / 3);
    this.setDynamicAttributeCount(this.colorAttribute, this.colorFloatCount / 3);
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, this.positionFloatCount / 3);
  }

  /**
   * Returns how many line segments were queued this frame.
   *
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return Math.floor(this.positionFloatCount / 6);
  }

  /** Disposes geometry and material resources. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Writes six position floats for the current segment and advances the cursor.
   *
   * @param ax Start X.
   * @param ay Start Y.
   * @param az Start Z.
   * @param bx End X.
   * @param by End Y.
   * @param bz End Z.
   */
  private writeEndpointPositions(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const index = this.positionFloatCount;
    this.positionData[index] = ax;
    this.positionData[index + 1] = ay;
    this.positionData[index + 2] = az;
    this.positionData[index + 3] = bx;
    this.positionData[index + 4] = by;
    this.positionData[index + 5] = bz;
    this.positionFloatCount = index + 6;
  }

  /**
   * Writes six color floats for the current segment and advances the cursor.
   *
   * @param colorA Start vertex color.
   * @param colorB End vertex color.
   */
  private writeEndpointColors(colorA: THREE.Color, colorB: THREE.Color): void {
    const index = this.colorFloatCount;
    this.colorData[index] = colorA.r;
    this.colorData[index + 1] = colorA.g;
    this.colorData[index + 2] = colorA.b;
    this.colorData[index + 3] = colorB.r;
    this.colorData[index + 4] = colorB.g;
    this.colorData[index + 5] = colorB.b;
    this.colorFloatCount = index + 6;
  }

  /**
   * Updates a dynamic buffer attribute's live vertex count.
   *
   * @param attribute Attribute backed by a growable typed array.
   * @param vertexCount Number of vertices currently in use.
   */
  private setDynamicAttributeCount(attribute: THREE.BufferAttribute, vertexCount: number): void {
    const mutableAttribute = attribute as THREE.BufferAttribute & { count: number };
    mutableAttribute.count = vertexCount;
  }

  /**
   * Grows typed-array storage when the frame needs more capacity, preserving
   * already-written floats for the current frame.
   *
   * @param positionCount Required position float count.
   * @param colorCount Required color float count.
   */
  private ensureCapacity(positionCount: number, colorCount: number): void {
    if (positionCount > this.positionData.length) {
      this.growPositionStorage(positionCount);
    }
    if (colorCount > this.colorData.length) {
      this.growColorStorage(colorCount);
    }
  }

  /**
   * Reallocates the position stream to at least the required float count.
   *
   * @param requiredFloatCount Minimum position floats needed.
   */
  private growPositionStorage(requiredFloatCount: number): void {
    const nextLength = this.nextCapacity(this.positionData.length, requiredFloatCount);
    const grown = new Float32Array(nextLength);
    grown.set(this.positionData);
    this.positionData = grown;
    this.positionAttribute = new THREE.BufferAttribute(this.positionData, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
  }

  /**
   * Reallocates the color stream to at least the required float count.
   *
   * @param requiredFloatCount Minimum color floats needed.
   */
  private growColorStorage(requiredFloatCount: number): void {
    const nextLength = this.nextCapacity(this.colorData.length, requiredFloatCount);
    const grown = new Float32Array(nextLength);
    grown.set(this.colorData);
    this.colorData = grown;
    this.colorAttribute = new THREE.BufferAttribute(this.colorData, 3);
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('color', this.colorAttribute);
  }

  /**
   * Picks a new typed-array length that doubles until the requirement is met.
   *
   * @param currentLength Existing float capacity.
   * @param requiredLength Minimum floats needed.
   * @returns New capacity.
   */
  private nextCapacity(currentLength: number, requiredLength: number): number {
    let next = Math.max(currentLength * 2, INITIAL_FLOAT_CAPACITY);
    while (next < requiredLength) {
      next *= 2;
    }
    return next;
  }
}
