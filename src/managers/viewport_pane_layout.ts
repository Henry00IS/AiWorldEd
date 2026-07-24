import type { ViewportPaneCount } from '../settings/settings_types.js';

type ViewportSlot = 'top' | 'front' | 'side' | 'perspective';

interface PaneLayoutDefinition {
  columns: string;
  rows: string;
  areas: string;
  visibleSlots: readonly ViewportSlot[];
}

const PANE_LAYOUTS: Readonly<Record<ViewportPaneCount, PaneLayoutDefinition>> = {
  1: {
    columns: '1fr',
    rows: '1fr',
    areas: '"perspective"',
    visibleSlots: ['perspective']
  },
  2: {
    columns: '1fr 1fr',
    rows: '1fr',
    areas: '"top perspective"',
    visibleSlots: ['top', 'perspective']
  },
  3: {
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    areas: '"top front"\n"perspective perspective"',
    visibleSlots: ['top', 'front', 'perspective']
  },
  4: {
    columns: '1fr 1fr',
    rows: '1fr 1fr',
    areas: '"top front"\n"side perspective"',
    visibleSlots: ['top', 'front', 'side', 'perspective']
  }
};

/**
 * Applies the selected viewport arrangement while retaining all viewport instances.
 */
export class ViewportPaneLayout {
  private readonly viewportArea: HTMLElement;
  private readonly viewports: readonly HTMLElement[];

  /**
   * Creates a layout controller for viewport containers ordered top, front, side, perspective.
   * @param viewportArea Grid element that hosts the viewport containers.
   * @param viewports Viewport containers ordered top, front, side, perspective.
   */
  constructor(viewportArea: HTMLElement, viewports: readonly HTMLElement[]) {
    this.viewportArea = viewportArea;
    this.viewports = viewports;
  }

  /**
   * Applies the requested visible-pane layout.
   * @param paneCount Number of panes to display.
   */
  apply(paneCount: ViewportPaneCount): void {
    const definition = PANE_LAYOUTS[paneCount];
    this.applyGridDefinition(definition);
    this.applyViewportVisibility(definition.visibleSlots);
  }

  /**
   * Updates the grid dimensions and named areas.
   * @param definition Layout definition to apply.
   */
  private applyGridDefinition(definition: PaneLayoutDefinition): void {
    this.viewportArea.style.gridTemplateColumns = definition.columns;
    this.viewportArea.style.gridTemplateRows = definition.rows;
    this.viewportArea.style.gridTemplateAreas = definition.areas;
  }

  /**
   * Shows only containers included by the selected layout.
   * @param visibleSlots Slot names that should remain visible.
   */
  private applyViewportVisibility(visibleSlots: readonly ViewportSlot[]): void {
    this.viewports.forEach((viewport, index) => {
      viewport.style.display = visibleSlots.includes(this.getSlot(index)) ? '' : 'none';
    });
  }

  /**
   * Resolves a viewport container index to its grid slot name.
   * @param index Viewport container index.
   * @returns Corresponding named grid slot.
   */
  private getSlot(index: number): ViewportSlot {
    return ['top', 'front', 'side', 'perspective'][index] as ViewportSlot;
  }
}
