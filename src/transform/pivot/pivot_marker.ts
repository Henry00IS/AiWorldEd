import * as THREE from 'three';
import { Theme } from '@/theme.js';

/** Marker diameter in screen pixels. */
const PIVOT_MARKER_SIZE_PX = 11;
/** Side of the generated dot texture in pixels. */
const PIVOT_MARKER_TEXTURE_PX = 32;
/** Most origins drawn at once. */
const PIVOT_MARKER_CAPACITY = 256;

/**
 * Draws a dot at the origin of each selected object, on top of the scene and at
 * a fixed screen size, so the pivot is visible apart from the geometry.
 */
export class PivotMarker {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly scratch = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array(PIVOT_MARKER_CAPACITY * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, 0);
    this.object = new THREE.Points(geometry, pivotMarkerMaterial());
    this.object.name = 'Pivot Marker';
    this.object.frustumCulled = false;
    this.object.renderOrder = 1000;
  }

  /**
   * Creates a marker and adds it to the shared scene's helpers.
   *
   * @param scene Scene that draws helpers in every viewport.
   * @returns Marker.
   */
  static install(scene: { addHelper(object: THREE.Object3D): void }): PivotMarker {
    const marker = new PivotMarker();
    scene.addHelper(marker.object);
    return marker;
  }

  /**
   * Places the dots on the origins of the given objects.
   *
   * @param objects Objects whose origins are shown.
   */
  sync(objects: readonly THREE.Object3D[]): void {
    const count = Math.min(objects.length, PIVOT_MARKER_CAPACITY);
    for (let index = 0; index < count; index++) {
      this.scratch.setFromMatrixPosition(objects[index]!.matrixWorld).toArray(this.positions, index * 3);
    }
    const geometry = this.object.geometry;
    geometry.setDrawRange(0, count);
    geometry.getAttribute('position').needsUpdate = true;
    this.object.visible = count > 0;
  }

  /** Releases the GPU resources. */
  dispose(): void {
    this.object.geometry.dispose();
    const material = this.object.material as THREE.PointsMaterial;
    material.map?.dispose();
    material.dispose();
  }
}

/**
 * Creates the always-on-top dot material.
 *
 * @returns Points material.
 */
function pivotMarkerMaterial(): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    size: PIVOT_MARKER_SIZE_PX,
    sizeAttenuation: false,
    map: pivotMarkerTexture(),
    transparent: true,
    alphaTest: 0.05,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * Builds a round dot in the selection color with a dark outline.
 *
 * @returns Dot texture.
 */
function pivotMarkerTexture(): THREE.DataTexture {
  const size = PIVOT_MARKER_TEXTURE_PX;
  const data = new Uint8Array(size * size * 4);
  const fill = new THREE.Color(Theme.selectionColor);
  for (let index = 0; index < size * size; index++) {
    const radius = Math.hypot((index % size) + 0.5 - size / 2, Math.floor(index / size) + 0.5 - size / 2) / (size / 2);
    const color = radius < 0.62 ? fill : new THREE.Color(0x101010);
    data.set([color.r * 255, color.g * 255, color.b * 255, radius < 1 ? 255 : 0], index * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
