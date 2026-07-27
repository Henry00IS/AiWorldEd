import * as THREE from 'three';
import { Theme } from '../theme.js';
import type { CadLabelSpec } from './cad_dimension_geometry.js';

/** One pooled DOM chip used for a world-space CAD label. */
interface CadLabelChip {
  element: HTMLDivElement;
  id: string;
}

/**
 * Sharp screen-space CAD dimension labels overlaid on a viewport. Uses a small
 * pooled set of DOM chips so thousands of scene brushes never create labels.
 */
export class CadRulerLabelLayer {
  private host: HTMLElement;
  private layer: HTMLDivElement;
  private chips: CadLabelChip[];
  private ndc: THREE.Vector3;
  private isDisposed: boolean;

  /**
   * Creates a label layer parented under a viewport container.
   *
   * @param viewportContainer Viewport root element (positioned relatively).
   */
  constructor(viewportContainer: HTMLElement) {
    this.host = viewportContainer;
    this.layer = this.createOwnerDocumentElement('div');
    this.chips = [];
    this.ndc = new THREE.Vector3();
    this.isDisposed = false;
    this.applyLayerStyles();
    this.host.appendChild(this.layer);
  }

  /**
   * Projects label specs into screen space and shows only on-screen chips. Uses
   * the host pane box (not the shared full-workspace canvas) so NDC from the
   * pane camera maps onto this overlay.
   *
   * @param labels World-space label specifications.
   * @param camera Viewport camera used for projection.
   */
  update(labels: CadLabelSpec[], camera: THREE.Camera): void {
    if (this.isDisposed) return;
    this.ensureChipCount(labels.length);
    const width = Math.max(1, this.host.clientWidth || 1);
    const height = Math.max(1, this.host.clientHeight || 1);
    for (let index = 0; index < this.chips.length; index += 1) {
      const chip = this.chips[index]!;
      if (index >= labels.length) {
        chip.element.style.display = 'none';
        continue;
      }
      this.placeChip(chip, labels[index]!, camera, width, height);
    }
  }

  /** Hides every label chip. */
  clear(): void {
    this.chips.forEach((chip) => {
      chip.element.style.display = 'none';
    });
  }

  /**
   * Returns how many chips currently exist in the pool.
   *
   * @returns Chip pool size.
   */
  getChipCount(): number {
    return this.chips.length;
  }

  /** Removes the layer from the DOM. */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.layer.remove();
    this.chips = [];
  }

  /** Applies non-interactive absolute styles to the overlay root. */
  private applyLayerStyles(): void {
    this.layer.className = 'cad-ruler-label-layer';
    this.layer.style.position = 'absolute';
    this.layer.style.inset = '0';
    this.layer.style.pointerEvents = 'none';
    this.layer.style.overflow = 'hidden';
    this.layer.style.zIndex = '12';
    this.layer.style.userSelect = 'none';
  }

  /**
   * Grows the chip pool when more labels are needed.
   *
   * @param requiredCount Needed chip count.
   */
  private ensureChipCount(requiredCount: number): void {
    while (this.chips.length < requiredCount) {
      this.chips.push(this.createChip());
    }
  }

  /**
   * Creates one label chip and appends it to the layer.
   *
   * @returns New chip entry.
   */
  private createChip(): CadLabelChip {
    const element = this.createOwnerDocumentElement('div');
    element.className = 'cad-ruler-label-chip';
    element.style.position = 'absolute';
    element.style.display = 'none';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.padding = '1px 5px';
    element.style.borderRadius = '3px';
    element.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    element.style.fontSize = '11px';
    element.style.fontWeight = '600';
    element.style.letterSpacing = '0.02em';
    element.style.lineHeight = '1.2';
    element.style.whiteSpace = 'nowrap';
    element.style.background = Theme.rulerLabelBackground;
    element.style.border = `1px solid ${Theme.rulerLabelBorder}`;
    element.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.45)';
    element.style.pointerEvents = 'none';
    this.layer.appendChild(element);
    return { element, id: '' };
  }

  /**
   * Creates an element in the host viewport's document so detached popup panes
   * receive same-document nodes (cross-document append is invalid).
   *
   * @param tagName HTML tag name.
   * @returns New element owned by the host document.
   */
  private createOwnerDocumentElement(tagName: string): HTMLDivElement {
    const ownerDocument = this.host.ownerDocument ?? document;
    return ownerDocument.createElement(tagName) as HTMLDivElement;
  }

  /**
   * Positions and styles one chip for a label, or hides it when off-screen.
   *
   * @param chip Chip to update.
   * @param label Label specification.
   * @param camera Projection camera.
   * @param width Pane host CSS width.
   * @param height Pane host CSS height.
   */
  private placeChip(
    chip: CadLabelChip,
    label: CadLabelSpec,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): void {
    this.ndc.copy(label.worldPosition).project(camera);
    if (!this.isOnScreen(this.ndc)) {
      chip.element.style.display = 'none';
      return;
    }
    const screenX = (this.ndc.x * 0.5 + 0.5) * width;
    const screenY = (-this.ndc.y * 0.5 + 0.5) * height;
    chip.id = label.id;
    chip.element.textContent = label.text;
    chip.element.style.color = label.colorCss;
    chip.element.style.left = `${screenX}px`;
    chip.element.style.top = `${screenY}px`;
    chip.element.style.display = 'block';
  }

  /**
   * Returns whether a projected NDC point lies inside the visible clip volume.
   *
   * @param ndc Projected coordinates.
   * @returns True when roughly on screen.
   */
  private isOnScreen(ndc: THREE.Vector3): boolean {
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) {
      return false;
    }
    return ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 1.15 && Math.abs(ndc.y) <= 1.15;
  }
}
