import * as THREE from 'three';

/**
 * Draws a soft vertical two-color gradient behind a viewport pane. Used by the
 * light theme; the dark theme keeps its flat clear color.
 */
export class ViewportBackgroundGradient {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly scratchColor: THREE.Color;
  private appliedTopColor: number | null;
  private appliedBottomColor: number | null;

  /** Creates the full-pane gradient quad and its camera. */
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = this.materialCreate();
    this.scratchColor = new THREE.Color();
    this.appliedTopColor = null;
    this.appliedBottomColor = null;
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
  }

  /**
   * Renders the gradient into the renderer's current viewport and scissor.
   *
   * @param renderer Renderer whose current pane receives the gradient.
   * @param topColor Display hex color at the top edge.
   * @param bottomColor Display hex color at the bottom edge.
   */
  render(renderer: THREE.WebGLRenderer, topColor: number, bottomColor: number): void {
    this.colorsApply(topColor, bottomColor);
    renderer.render(this.scene, this.camera);
  }

  /** Releases the GPU resources owned by the gradient. */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  /**
   * Builds the unlit, depth-free vertex color material.
   *
   * @returns Gradient material.
   */
  private materialCreate(): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    return material;
  }

  /**
   * Writes the top and bottom colors into the quad vertices when they change.
   *
   * @param topColor Display hex color at the top edge.
   * @param bottomColor Display hex color at the bottom edge.
   */
  private colorsApply(topColor: number, bottomColor: number): void {
    if (topColor === this.appliedTopColor && bottomColor === this.appliedBottomColor) {
      return;
    }
    const colorAttribute = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positionAttribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++) {
      const isTopVertex = positionAttribute.getY(vertexIndex) > 0;
      this.scratchColor.setHex(isTopVertex ? topColor : bottomColor);
      colorAttribute.setXYZ(vertexIndex, this.scratchColor.r, this.scratchColor.g, this.scratchColor.b);
    }
    colorAttribute.needsUpdate = true;
    this.appliedTopColor = topColor;
    this.appliedBottomColor = bottomColor;
  }
}
