import * as THREE from 'three';

/** Opacity of the preview's faint fill. */
const PAINT_DECAL_PREVIEW_FILL = 0.12;

/**
 * Outline of the decal volume a click would place, drawn over everything so it
 * reads on any surface.
 */
export class PaintDecalFitPreview {
  /** Object to add to the scene. */
  readonly object = new THREE.Group();
  private readonly edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  private readonly fill: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;

  /** Creates a hidden preview. */
  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }),
    );
    this.fill = new THREE.Mesh(
      box,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: PAINT_DECAL_PREVIEW_FILL,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.object.name = 'paint_decal_preview';
    this.object.matrixAutoUpdate = false;
    this.object.renderOrder = 1000;
    this.edges.renderOrder = 1001;
    this.fill.renderOrder = 1000;
    this.object.add(this.fill, this.edges);
    this.object.visible = false;
    this.object.userData['editorHelper'] = true;
  }

  /**
   * Shows the preview at a fitted place.
   *
   * @param fit World matrix of the unit box.
   * @param color 0xRRGGBB.
   */
  show(fit: THREE.Matrix4, color: number): void {
    this.object.matrix.copy(fit);
    this.object.matrixWorldNeedsUpdate = true;
    this.edges.material.color.setHex(color);
    this.fill.material.color.setHex(color);
    this.object.visible = true;
  }

  /** Hides the preview. */
  hide(): void {
    this.object.visible = false;
  }

  /** Frees GPU resources. */
  dispose(): void {
    this.object.removeFromParent();
    this.edges.geometry.dispose();
    this.edges.material.dispose();
    this.fill.geometry.dispose();
    this.fill.material.dispose();
  }
}
