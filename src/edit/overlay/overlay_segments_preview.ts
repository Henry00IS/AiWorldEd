import * as THREE from 'three';
import { Theme } from '@/theme.js';

/** Bright line segments that preview geometry an Edit Mode tool would create. */
export class OverlaySegmentsPreview {
  private readonly scene: THREE.Scene;
  private readonly lines: THREE.LineSegments;

  /**
   * Creates the preview in a scene.
   *
   * @param scene Scene that receives the segments.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.lines = createPreviewLines();
    this.scene.add(this.lines);
  }

  /**
   * Shows segments given as endpoint pairs in world space.
   *
   * @param points Endpoints, two per segment.
   */
  setSegments(points: readonly THREE.Vector3[]): void {
    const previous = this.lines.geometry;
    this.lines.geometry = new THREE.BufferGeometry().setFromPoints(points.slice());
    previous.dispose();
    this.lines.visible = points.length >= 2;
  }

  /**
   * Returns whether any segment is shown.
   *
   * @returns True when visible.
   */
  isVisible(): boolean {
    return this.lines.visible;
  }

  /** Removes the segments and disposes resources. */
  dispose(): void {
    this.scene.remove(this.lines);
    this.lines.geometry.dispose();
    const material = this.lines.material;
    if (!Array.isArray(material)) material.dispose();
  }
}

/**
 * Builds the preview line object.
 *
 * @returns Hidden line segments drawn on top of the scene.
 */
function createPreviewLines(): THREE.LineSegments {
  const material = new THREE.LineBasicMaterial({ color: Theme.clipMarkerColor, depthTest: false, toneMapped: false });
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
  lines.name = 'overlay_segments_preview';
  lines.renderOrder = 1020;
  lines.frustumCulled = false;
  lines.visible = false;
  lines.raycast = () => undefined;
  return lines;
}
