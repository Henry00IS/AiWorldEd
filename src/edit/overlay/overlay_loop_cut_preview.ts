import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { TopologyLoopCutCrossing } from '@/edit/topology/topology_loop_cut_plane.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';

/** Yellow polyline showing a pending loop-cut belt. */
export class OverlayLoopCutPreview {
  private readonly scene: THREE.Scene;
  private readonly line: THREE.LineLoop;
  private visible: boolean;

  /**
   * Creates the preview in a scene.
   *
   * @param scene Scene that receives the loop.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.line = createLoopLine();
    this.scene.add(this.line);
    this.visible = false;
  }

  /**
   * Shows the loop at the crossing positions of working geometry.
   *
   * @param geometry Working geometry.
   * @param crossings Loop crossings.
   * @param worldMatrix Local-to-world matrix.
   */
  setLoop(
    geometry: TopologyWorkingGeometry,
    crossings: readonly TopologyLoopCutCrossing[],
    worldMatrix: THREE.Matrix4,
  ): void {
    const points = collectCrossingWorldPoints(geometry, crossings, worldMatrix);
    if (points.length < 3) {
      return;
    }
    assignLoopLinePoints(this.line, points);
    this.line.visible = true;
    this.visible = true;
  }

  /** Hides the loop. */
  clear(): void {
    this.line.visible = false;
    this.visible = false;
  }

  /**
   * Returns whether the loop is visible.
   *
   * @returns True when shown.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /** Removes the loop and disposes resources. */
  dispose(): void {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    const material = this.line.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
  }
}

/**
 * Writes loop points into the line, replacing the geometry when the count
 * changes.
 *
 * @param line Loop line.
 * @param points World points.
 */
function assignLoopLinePoints(line: THREE.LineLoop, points: readonly THREE.Vector3[]): void {
  const position = line.geometry.getAttribute('position');
  if (position && position.count === points.length) {
    writeLoopPoints(position, points);
    line.geometry.computeBoundingSphere();
    return;
  }
  replaceLoopLineGeometry(line, points);
}

/**
 * Copies points into an existing position attribute of the same length.
 *
 * @param position Position attribute.
 * @param points World points.
 */
function writeLoopPoints(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  points: readonly THREE.Vector3[],
): void {
  for (let index = 0; index < points.length; index += 1) {
    writeOneLoopPoint(position, points[index], index);
  }
  position.needsUpdate = true;
}

/**
 * Writes one loop point when it exists.
 *
 * @param position Position attribute.
 * @param point World point, or undefined.
 * @param index Attribute index.
 */
function writeOneLoopPoint(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  point: THREE.Vector3 | undefined,
  index: number,
): void {
  if (!point) {
    return;
  }
  position.setXYZ(index, point.x, point.y, point.z);
}

/**
 * Replaces the line geometry with a buffer sized for these points.
 *
 * @param line Loop line.
 * @param points World points.
 */
function replaceLoopLineGeometry(line: THREE.LineLoop, points: readonly THREE.Vector3[]): void {
  const nextGeometry = createLoopPointGeometry(points);
  const previousGeometry = line.geometry;
  line.geometry = nextGeometry;
  previousGeometry.dispose();
}

/**
 * Builds a position buffer for one loop.
 *
 * @param points World points.
 * @returns Geometry whose position count matches the points.
 */
function createLoopPointGeometry(points: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points.slice());
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Builds the loop line.
 *
 * @returns Line loop.
 */
function createLoopLine(): THREE.LineLoop {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: Theme.clipMarkerColor,
    depthTest: false,
    toneMapped: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.name = 'overlay_loop_cut_preview';
  line.renderOrder = 1020;
  line.frustumCulled = false;
  line.visible = false;
  line.raycast = () => undefined;
  return line;
}

/**
 * Collects world positions for loop-cut crossings.
 *
 * @param geometry Working geometry.
 * @param crossings Crossings.
 * @param worldMatrix Local-to-world matrix.
 * @returns World points.
 */
function collectCrossingWorldPoints(
  geometry: TopologyWorkingGeometry,
  crossings: readonly TopologyLoopCutCrossing[],
  worldMatrix: THREE.Matrix4,
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const crossing of crossings) {
    const start = topologyWorkingVertexRead(geometry, crossing.vertexA);
    const end = topologyWorkingVertexRead(geometry, crossing.vertexB);
    if (!start || !end) {
      continue;
    }
    points.push(start.clone().lerp(end, crossing.parameter).applyMatrix4(worldMatrix));
  }
  return points;
}
