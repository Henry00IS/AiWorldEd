import * as THREE from 'three';

/** Growable line-segment buffer with per-vertex colors for grid rendering. */
export class GridLineBuffer {
  private positions: number[];
  private colors: number[];
  private positionData: Float32Array;
  private colorData: Float32Array;
  private positionAttribute: THREE.BufferAttribute;
  private colorAttribute: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private lineSegments: THREE.LineSegments;

  /** Creates an empty line buffer ready for per-frame rebuilds. */
  constructor() {
    this.positions = [];
    this.colors = [];
    this.positionData = new Float32Array(0);
    this.colorData = new Float32Array(0);
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
   * Enables or disables depth testing for grid lines. Orthographic reference
   * grids typically disable depth so lines are not occluded by content.
   *
   * @param enabled True to compare against the depth buffer.
   */
  setDepthTest(enabled: boolean): void {
    this.material.depthTest = enabled;
  }

  /**
   * Sets the LineSegments render order used by the opaque painter sort.
   *
   * @param renderOrder Lower values draw earlier (behind higher-order content).
   */
  setRenderOrder(renderOrder: number): void {
    this.lineSegments.renderOrder = renderOrder;
  }

  /** Clears all queued line data for a new frame. */
  beginFrame(): void {
    this.positions.length = 0;
    this.colors.length = 0;
  }

  /**
   * Appends a colored line segment between two points.
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
    this.positions.push(ax, ay, az, bx, by, bz);
    this.colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
  }

  /** Uploads queued data to GPU attributes without reallocating when possible. */
  endFrame(): void {
    this.uploadAttributeArrays();
    this.geometry.computeBoundingSphere();
  }

  /**
   * Returns how many line segments were queued this frame.
   *
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return Math.floor(this.positions.length / 6);
  }

  /** Disposes geometry and material resources. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /** Copies queued numbers into growable typed arrays and marks GPU dirty. */
  private uploadAttributeArrays(): void {
    const positionCount = this.positions.length;
    const colorCount = this.colors.length;
    this.ensureCapacity(positionCount, colorCount);
    this.positionData.set(this.positions);
    this.colorData.set(this.colors);
    this.setDynamicAttributeCount(this.positionAttribute, positionCount / 3);
    this.setDynamicAttributeCount(this.colorAttribute, colorCount / 3);
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.geometry.setDrawRange(0, positionCount / 3);
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
   * Grows attribute storage when the frame needs more capacity.
   *
   * @param positionCount Required position float count.
   * @param colorCount Required color float count.
   */
  private ensureCapacity(positionCount: number, colorCount: number): void {
    if (positionCount > this.positionData.length) {
      this.positionData = new Float32Array(Math.max(positionCount, this.positionData.length * 2 || 64));
      this.positionAttribute = new THREE.BufferAttribute(this.positionData, 3);
      this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute('position', this.positionAttribute);
    }
    if (colorCount > this.colorData.length) {
      this.colorData = new Float32Array(Math.max(colorCount, this.colorData.length * 2 || 64));
      this.colorAttribute = new THREE.BufferAttribute(this.colorData, 3);
      this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute('color', this.colorAttribute);
    }
  }
}
