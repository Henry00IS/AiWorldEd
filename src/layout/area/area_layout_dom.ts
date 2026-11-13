import { Theme } from '@/theme.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import type { AreaLeafPayload } from './area_editor_type.js';
import { normalizedRectToPixelRect } from './area_pixel_rect.js';

/** Options controlling gap inset between tiled areas. */
export interface AreaLayoutDomOptions {
  /** Gap between panes in CSS pixels (defaults to theme separator). */
  gapPx?: number;
}

/**
 * Positions absolute pane containers from normalized leaf placements so the
 * shared canvas can scissor against integer pixel content boxes (avoids the
 * half-pixel blur from percentage layout).
 */
export class AreaLayoutDom {
  private readonly layer: HTMLElement;
  private readonly containers: Map<string, HTMLElement>;
  private readonly gapPx: number;
  private lastPlacements: readonly AreaLeafPlacement[];

  /**
   * Creates a DOM applier for an absolute pane layer.
   *
   * @param layer Absolute-positioned host for pane chrome containers.
   * @param options Optional gap override.
   */
  constructor(layer: HTMLElement, options: AreaLayoutDomOptions = {}) {
    this.layer = layer;
    this.containers = new Map();
    this.gapPx = options.gapPx ?? Theme.separatorGapPx;
    this.lastPlacements = [];
    this.prepareLayer();
    this.adoptExistingLayerChildren();
  }

  /**
   * Ensures a container exists for each placement and applies absolute
   * geometry.
   *
   * @param placements Current leaf placements.
   * @param options.pruneMissing When true, detaches containers not in
   *   placements (join/split). When false (default), hides them so preset
   *   switches can restore seed panes without recreating viewport hosts.
   * @returns Containers in placement order.
   */
  applyPlacements(placements: readonly AreaLeafPlacement[], options: { pruneMissing?: boolean } = {}): HTMLElement[] {
    this.lastPlacements = placements;
    const liveIds = new Set(placements.map((item) => item.payload.areaId));
    if (options.pruneMissing === true) {
      this.removeStaleContainers(liveIds);
    } else {
      this.hideStaleContainers(liveIds);
    }
    return placements.map((placement) => this.applyOnePlacement(placement));
  }

  /**
   * Re-snaps the last applied placements to integer pixels for the current
   * layer size without changing which panes are live. Call on workspace
   * resize.
   */
  reapplyPixelGeometry(): void {
    if (this.lastPlacements.length === 0) return;
    for (const placement of this.lastPlacements) {
      const container = this.containers.get(placement.payload.areaId);
      if (!container || container.style.display === 'none') continue;
      this.applyRectStyles(container, placement.rect);
    }
  }

  /**
   * Returns the container for an area id when present.
   *
   * @param areaId Area identifier.
   * @returns Host element or null.
   */
  getContainer(areaId: string): HTMLElement | null {
    return this.containers.get(areaId) ?? null;
  }

  /**
   * Returns every managed container in map insertion order.
   *
   * @returns Container elements.
   */
  getContainers(): HTMLElement[] {
    return [...this.containers.values()];
  }

  /**
   * Ensures a container exists for a payload without changing geometry yet.
   *
   * @param payload Leaf payload.
   * @returns Container element.
   */
  ensureContainer(payload: AreaLeafPayload): HTMLElement {
    const existing = this.containers.get(payload.areaId);
    if (existing) return existing;
    const container = this.createContainer(payload.areaId);
    this.containers.set(payload.areaId, container);
    this.layer.appendChild(container);
    return container;
  }

  /**
   * Removes a container by area id.
   *
   * @param areaId Area identifier.
   */
  removeContainer(areaId: string): void {
    const container = this.containers.get(areaId);
    if (!container) return;
    container.remove();
    this.containers.delete(areaId);
  }

  /** Clears all containers from the layer. */
  clear(): void {
    this.containers.forEach((container) => container.remove());
    this.containers.clear();
    this.lastPlacements = [];
  }

  /** Styles the pane layer as an absolute fill host (not a CSS grid). */
  private prepareLayer(): void {
    this.layer.style.position = 'absolute';
    this.layer.style.inset = '0';
    this.layer.style.display = 'block';
    this.layer.style.gridTemplateColumns = '';
    this.layer.style.gridTemplateRows = '';
    this.layer.style.gridTemplateAreas = '';
    this.layer.style.gap = '';
    this.layer.style.padding = '';
    this.layer.style.boxSizing = 'border-box';
    this.layer.style.zIndex = this.layer.style.zIndex || '1';
  }

  /**
   * Applies geometry for one placement and returns its container.
   *
   * @param placement Leaf placement.
   * @returns Positioned container.
   */
  private applyOnePlacement(placement: AreaLeafPlacement): HTMLElement {
    const container = this.ensureContainer(placement.payload);
    this.applyRectStyles(container, placement.rect);
    container.style.display = '';
    return container;
  }

  /**
   * Converts a normalized rect into integer CSS pixel box with half-gap
   * gutters.
   *
   * @param container Target element.
   * @param rect Normalized rect in [0,1].
   */
  private applyRectStyles(container: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void {
    const pixel = normalizedRectToPixelRect(rect, this.layer.clientWidth, this.layer.clientHeight, this.gapPx);
    container.style.position = 'absolute';
    container.style.left = `${pixel.left}px`;
    container.style.top = `${pixel.top}px`;
    container.style.width = `${pixel.width}px`;
    container.style.height = `${pixel.height}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
    container.style.gridArea = '';
    container.style.overflow = 'hidden';
    container.style.boxSizing = 'border-box';
  }

  /**
   * Creates a new pane chrome container.
   *
   * @param areaId Area identifier for data attributes.
   * @returns New HTML element.
   */
  private createContainer(areaId: string): HTMLElement {
    const element = this.layer.ownerDocument.createElement('div');
    element.dataset['areaId'] = areaId;
    element.classList.add('editor-area-pane');
    element.style.position = 'absolute';
    element.style.overflow = 'hidden';
    element.style.background = 'transparent';
    return element;
  }

  /**
   * Detaches containers whose ids are no longer live.
   *
   * @param liveIds Active area ids.
   */
  private removeStaleContainers(liveIds: ReadonlySet<string>): void {
    for (const [areaId, container] of this.containers) {
      if (liveIds.has(areaId)) continue;
      container.remove();
      this.containers.delete(areaId);
    }
  }

  /**
   * Hides containers whose ids are not in the live set without destroying them.
   *
   * @param liveIds Active area ids.
   */
  private hideStaleContainers(liveIds: ReadonlySet<string>): void {
    for (const [areaId, container] of this.containers) {
      if (liveIds.has(areaId)) continue;
      container.style.display = 'none';
    }
  }

  /**
   * Registers pre-existing layer children that already carry data-area-id so
   * shell seed containers are reused instead of recreated.
   */
  private adoptExistingLayerChildren(): void {
    const children = Array.from(this.layer.children) as HTMLElement[];
    for (const child of children) {
      const areaId = child.dataset['areaId'];
      if (!areaId || this.containers.has(areaId)) continue;
      this.containers.set(areaId, child);
    }
  }
}
