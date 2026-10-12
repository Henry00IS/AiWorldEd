import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { computeEdgeCutCaretWorldEnds } from './overlay_edge_cut_caret_math.js';

/** Orange I-beam caret shown on a hovered edge (Shape Editor-style cut marker). */
export class OverlayEdgeCutPreview {
  private readonly scene: THREE.Scene;
  private readonly bar: THREE.Line;
  private visible: boolean;

  /**
   * Creates the preview in a scene.
   *
   * @param scene Scene that receives the caret.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.bar = createCaretLine();
    this.scene.add(this.bar);
    this.visible = false;
  }

  /**
   * Places the caret at a world point, across the edge in the camera plane.
   *
   * @param worldPoint World position on the edge.
   * @param edgeDirection World edge direction.
   * @param camera Active camera.
   */
  setHover(worldPoint: THREE.Vector3, edgeDirection: THREE.Vector3, camera: THREE.Camera): void {
    const ends = computeEdgeCutCaretWorldEnds(worldPoint, edgeDirection, camera);
    writeCaretEndpoints(this.bar.geometry, ends.start, ends.end);
    this.bar.visible = true;
    this.visible = true;
  }

  /** Hides the caret. */
  clearHover(): void {
    this.bar.visible = false;
    this.visible = false;
  }

  /**
   * Returns whether the caret is visible.
   *
   * @returns True when shown.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /** Removes the caret and disposes resources. */
  dispose(): void {
    this.scene.remove(this.bar);
    this.bar.geometry.dispose();
    const material = this.bar.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
  }
}

/**
 * Builds the caret line geometry.
 *
 * @returns Line.
 */
function createCaretLine(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineBasicMaterial({
    color: Theme.selectionColor,
    depthTest: false,
    toneMapped: false,
  });
  const line = new THREE.Line(geometry, material);
  line.name = 'overlay_edge_cut_preview';
  line.renderOrder = 1020;
  line.frustumCulled = false;
  line.visible = false;
  line.raycast = () => undefined;
  return line;
}

/**
 * Writes world caret endpoints into the line geometry.
 *
 * @param geometry Line geometry.
 * @param start First endpoint.
 * @param end Second endpoint.
 */
function writeCaretEndpoints(geometry: THREE.BufferGeometry, start: THREE.Vector3, end: THREE.Vector3): void {
  geometry.setFromPoints([start, end]);
  geometry.computeBoundingSphere();
}
