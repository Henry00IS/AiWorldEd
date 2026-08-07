import type { ViewportPaneCount } from '@/settings/store/settings_types.js';
import { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import type { AreaLeafPlacement } from '@/layout/area/area_leaf_placement.js';
import { listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';

/** Named viewport slot identifiers: top, front, side, and perspective. */
export type ViewportSlot = 'top' | 'front' | 'side' | 'perspective';

/**
 * Applies and queries viewport pane arrangements for pane-count presets,
 * maximize, leaf placements, and visible slot names.
 */
export class ViewportPaneLayout {
  private readonly controller: ControllerAreaLayout;
  private readonly areaIdByIndex: string[];

  /**
   * Creates a viewport pane layout on the host element and applies the default
   * arrangement.
   *
   * @param paneLayer Host element that receives the layout DOM.
   * @param _legacyViewports Accepted and discarded without effect.
   */
  constructor(paneLayer: HTMLElement, _legacyViewports: readonly HTMLElement[] = []) {
    void _legacyViewports;
    this.controller = new ControllerAreaLayout(paneLayer);
    this.areaIdByIndex = [
      DEFAULT_AREA_IDS.top,
      DEFAULT_AREA_IDS.front,
      DEFAULT_AREA_IDS.side,
      DEFAULT_AREA_IDS.perspective,
    ];
    this.controller.apply();
  }

  /**
   * Returns the area layout controller held by this instance.
   *
   * @returns Area layout controller.
   */
  getAreaLayoutController(): ControllerAreaLayout {
    return this.controller;
  }

  /**
   * Applies the requested visible-pane layout preset (1–4).
   *
   * @param paneCount Number of panes to display.
   */
  apply(paneCount: ViewportPaneCount): void {
    this.controller.applyPaneCountPreset(paneCount);
  }

  /**
   * Returns the slot names of currently visible panes, omitting unknown area
   * ids.
   *
   * @returns Visible slot names in placement order.
   */
  getVisibleSlots(): readonly ViewportSlot[] {
    const placements = this.controller.getPlacements();
    return placements
      .map((placement) => this.slotForAreaId(placement.payload.areaId))
      .filter((slot): slot is ViewportSlot => slot !== null);
  }

  /**
   * Maximizes one viewport by index, or restores when toggled again.
   *
   * @param viewportIndex Viewport index in default quad order (top, front,
   *   side, perspective) when possible; falls back to logical placement order.
   * @returns Maximized index, or null after restore.
   */
  toggleMaximized(viewportIndex: number): number | null {
    const areaId = this.resolveAreaIdForIndex(viewportIndex);
    if (!areaId) return null;
    const result = this.controller.toggleMaximized(areaId);
    if (result === null) return null;
    return viewportIndex;
  }

  /**
   * Returns the current leaf placements.
   *
   * @returns Leaf placements.
   */
  getPlacements(): readonly AreaLeafPlacement[] {
    return this.controller.getPlacements();
  }

  /**
   * Sets or clears the layout-change callback.
   *
   * @param handler Receives leaf placements when the layout changes, or null to
   *   clear.
   */
  setOnLayoutChanged(handler: ((placements: readonly AreaLeafPlacement[]) => void) | null): void {
    this.controller.setOnLayoutChanged(handler);
  }

  /**
   * Resolves the area id for a viewport index from the logical layout tree.
   *
   * @param viewportIndex Zero-based index into the default quad order when that
   *   mapping is present in the logical tree; otherwise into logical leaf
   *   order.
   * @returns Area id when resolvable, otherwise null.
   */
  private resolveAreaIdForIndex(viewportIndex: number): string | null {
    const byDefault = this.areaIdByIndex[viewportIndex];
    if (byDefault) {
      const logicalIds = listAreaLeafPlacements(this.controller.getRoot()).map((item) => item.payload.areaId);
      if (logicalIds.includes(byDefault)) return byDefault;
    }
    const logicalPlacements = listAreaLeafPlacements(this.controller.getRoot());
    return logicalPlacements[viewportIndex]?.payload.areaId ?? null;
  }

  /**
   * Maps a known default area id to its viewport slot name.
   *
   * @param areaId Area identifier.
   * @returns Slot name, or null when the id is not a known default.
   */
  private slotForAreaId(areaId: string): ViewportSlot | null {
    if (areaId === DEFAULT_AREA_IDS.top) return 'top';
    if (areaId === DEFAULT_AREA_IDS.front) return 'front';
    if (areaId === DEFAULT_AREA_IDS.side) return 'side';
    if (areaId === DEFAULT_AREA_IDS.perspective) return 'perspective';
    return null;
  }
}
