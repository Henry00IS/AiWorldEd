import * as THREE from 'three';

/**
 * Growable line-segment buffer with per-vertex colors for grid rendering.
 */
export class GridLineBuffer {
  private positions: number[];
  private colors: number[];
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;
  private lineSegments: THREE.LineSegments;

  /**
   * Creates an empty line buffer ready for per-frame rebuilds.
   */
  constructor() {
    this.positions = [];
    this.colors = [];
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      depthWrite: false
    });
    this.lineSegments = new THREE.LineSegments(this.geometry, this.material);
    this.lineSegments.frustumCulled = false;
    this.lineSegments.name = 'grid_lines';
  }

  /**
   * Returns the LineSegments object to add to a scene.
   * @returns The line segments mesh.
   */
  getObject(): THREE.LineSegments {
    return this.lineSegments;
  }

  /**
   * Clears all queued line data for a new frame.
   */
  beginFrame(): void {
    this.positions.length = 0;
    this.colors.length = 0;
  }

  /**
   * Appends a colored line segment between two points.
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
    colorB: THREE.Color
  ): void {
    this.positions.push(ax, ay, az, bx, by, bz);
    this.colors.push(colorA.r, colorA.g, colorA.b, colorB.r, colorB.g, colorB.b);
  }

  /**
   * Uploads queued data to GPU attributes.
   */
  endFrame(): void {
    this.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(this.colors, 3)
    );
    this.geometry.computeBoundingSphere();
  }

  /**
   * Returns how many line segments were queued this frame.
   * @returns Segment count.
   */
  getSegmentCount(): number {
    return Math.floor(this.positions.length / 6);
  }

  /**
   * Disposes geometry and material resources.
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
