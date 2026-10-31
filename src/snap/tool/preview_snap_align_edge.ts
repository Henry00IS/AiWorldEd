import * as THREE from 'three';
import { Theme } from '@/theme.js';

/** Orange line drawn on the hinge edge while that tool is choosing and aiming. */
export class PreviewSnapAlignEdge {
  private readonly scene: THREE.Scene;
  private readonly line: THREE.Line;
  private visible: boolean;

  /**
   * Creates the line in a scene.
   *
   * @param scene Scene that receives the line.
   * @param lineName Object name used to find the line.
   */
  constructor(scene: THREE.Scene, lineName = 'preview_snap_align_edge') {
    this.scene = scene;
    this.line = createEdgeLine(lineName);
    this.scene.add(this.line);
    this.visible = false;
  }

  /**
   * Shows the segment between two world points.
   *
   * @param start World start.
   * @param end World end.
   */
  setSegment(start: THREE.Vector3, end: THREE.Vector3): void {
    writeSegment(this.line.geometry, start, end);
    this.line.visible = true;
    this.visible = true;
  }

  /** Hides the line. */
  clear(): void {
    this.line.visible = false;
    this.visible = false;
  }

  /**
   * Returns whether the line is visible.
   *
   * @returns True when shown.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /** Removes the line and disposes its resources. */
  dispose(): void {
    this.clear();
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    disposeMaterial(this.line.material);
  }
}

/**
 * Builds the overlay line.
 *
 * @param lineName Object name.
 * @returns Line that does not participate in picking.
 */
function createEdgeLine(lineName: string): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineBasicMaterial({
    color: Theme.selectionColor,
    depthTest: false,
    transparent: true,
    toneMapped: false,
  });
  const line = new THREE.Line(geometry, material);
  line.name = lineName;
  line.renderOrder = 1020;
  line.frustumCulled = false;
  line.visible = false;
  line.raycast = () => undefined;
  return line;
}

/**
 * Writes world endpoints into a line geometry.
 *
 * @param geometry Line geometry.
 * @param start World start.
 * @param end World end.
 */
function writeSegment(geometry: THREE.BufferGeometry, start: THREE.Vector3, end: THREE.Vector3): void {
  const positions = geometry.getAttribute('position');
  positions.setXYZ(0, start.x, start.y, start.z);
  positions.setXYZ(1, end.x, end.y, end.z);
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}

/**
 * Disposes a line material.
 *
 * @param material Line material.
 */
function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    return;
  }
  material.dispose();
}
