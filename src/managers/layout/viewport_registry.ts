import { createViewportForKind, type ViewportFactoryDependencies } from '../../viewports/viewport_factory.js';
import { disposeEditorViewport } from '../../viewports/viewport_dispose.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import {
  DEFAULT_VIEWPORT_QUAD_KINDS,
  ViewportKind,
  getViewportKindDisplayLabel,
  isPerspectiveViewportKind,
} from '../../viewports/viewport_kind.js';
import { ViewportPane } from './viewport_pane.js';
import { createDefaultCoordinateSpace } from '../../settings/coordinate_space_presets.js';
import type { CoordinateSpaceDefinition } from '../../settings/coordinate_space_types.js';
import { CoordinateSpaceAdapter, type CoordinateAxis } from '../../coordinates/coordinate_space_adapter.js';
import { getViewportKindMetadata } from '../../viewports/viewport_kind.js';

/** Stable default pane ids for the classic four-viewport layout. */
export const DEFAULT_PANE_IDS = ['pane_top', 'pane_front', 'pane_side', 'pane_perspective'] as const;

/**
 * Creates a viewport for a kind. Injectable for unit tests without WebGL.
 *
 * @param kind Viewport kind.
 * @param container Host element.
 * @param dependencies Factory dependencies.
 * @returns Live viewport instance.
 */
export type ViewportCreateFn = (
  kind: ViewportKind,
  container: HTMLElement,
  dependencies: ViewportFactoryDependencies,
) => EditorViewport;

/**
 * Owns layout panes and their live viewport instances. Consumers iterate active
 * viewports instead of hard-coded Top/Front/Side/Perspective fields.
 *
 * Pane registration order is layout-stable (maximize / slot indices). Active
 * multi-view render order is a separate cache: orthographic panes first, then
 * perspective, rebuilt only when structure, kind, or active flags change so
 * shared-material depth modes flip at most once per frame instead of 2D↔3D
 * every alternating pane.
 */
export class ViewportRegistry {
  private panes: ViewportPane[];
  private factoryDependencies: ViewportFactoryDependencies | null;
  private createViewport: ViewportCreateFn;
  /**
   * Active viewports in multi-view draw order (all orthographic, then all
   * perspective). Invalidated and rebuilt by layout/kind mutations only.
   */
  private activeRenderViewports: EditorViewport[];
  private coordinateSpace: CoordinateSpaceDefinition;

  /**
   * Creates an empty registry. Call populateDefaultQuad or addPane to fill.
   *
   * @param createViewport Optional factory override for tests.
   */
  constructor(createViewport: ViewportCreateFn = createViewportForKind) {
    this.panes = [];
    this.factoryDependencies = null;
    this.createViewport = createViewport;
    this.activeRenderViewports = [];
    this.coordinateSpace = createDefaultCoordinateSpace();
  }

  /**
   * Stores factory dependencies used for create and replace operations.
   *
   * @param dependencies Input manager and related construction deps.
   */
  setFactoryDependencies(dependencies: ViewportFactoryDependencies): void {
    this.factoryDependencies = dependencies;
  }

  /**
   * Builds the classic four-pane layout into the given containers.
   *
   * @param containers DOM containers in default quad order.
   * @param dependencies Factory dependencies for viewport construction.
   */
  populateDefaultQuad(containers: HTMLElement[], dependencies: ViewportFactoryDependencies): void {
    this.setFactoryDependencies(dependencies);
    this.disposeAllViewports();
    this.panes = [];
    this.activeRenderViewports = [];
    DEFAULT_VIEWPORT_QUAD_KINDS.forEach((kind, index) => {
      const container = containers[index];
      if (!container) return;
      const paneId = DEFAULT_PANE_IDS[index] ?? `pane_${index}`;
      this.addPaneWithKind(paneId, container, kind);
    });
  }

  /**
   * Adds a pane and immediately creates a viewport of the given kind.
   *
   * @param id Stable pane id.
   * @param container Host DOM element.
   * @param kind Viewport kind to create.
   * @returns The created pane.
   */
  addPaneWithKind(id: string, container: HTMLElement, kind: ViewportKind): ViewportPane {
    const pane = new ViewportPane(id, container, kind);
    this.panes.push(pane);
    this.createViewportInPane(pane, kind);
    this.rebuildActiveRenderViewports();
    return pane;
  }

  /**
   * Returns all panes in registration / layout order (not multi-view draw
   * order). Use this for maximize indices and area chrome.
   *
   * @returns Readonly pane list.
   */
  getPanes(): readonly ViewportPane[] {
    return this.panes;
  }

  /**
   * Returns a pane by id when present.
   *
   * @param id Pane identifier.
   * @returns Matching pane or null.
   */
  getPaneById(id: string): ViewportPane | null {
    return this.panes.find((pane) => pane.getId() === id) ?? null;
  }

  /**
   * Returns a pane by index when present.
   *
   * @param index Zero-based pane index in registration order.
   * @returns Matching pane or null.
   */
  getPaneByIndex(index: number): ViewportPane | null {
    return this.panes[index] ?? null;
  }

  /**
   * Returns live viewport instances for active panes in multi-view draw order:
   * every orthographic pane first (registration order preserved within the
   * group), then every perspective pane. The list is cached and only rebuilt
   * when panes, kinds, or active flags change.
   *
   * @returns Active editor viewports ready for the render loop.
   */
  getActiveViewports(): readonly EditorViewport[] {
    return this.activeRenderViewports;
  }

  /**
   * Returns every live viewport instance regardless of active flag, in
   * registration order.
   *
   * @returns All non-null viewport instances.
   */
  getAllViewports(): EditorViewport[] {
    return this.panes
      .map((pane) => pane.getViewport())
      .filter((viewport): viewport is EditorViewport => viewport !== null);
  }

  /**
   * Applies coordinate presentation to current and future viewports.
   *
   * @param space Active profile coordinate space.
   */
  setCoordinateSpace(space: CoordinateSpaceDefinition): void {
    this.coordinateSpace = { ...space };
    this.getAllViewports().forEach((viewport) => this.applyCoordinateSpaceToViewport(viewport));
  }

  /**
   * Returns pane DOM containers in registration order.
   *
   * @returns Container elements.
   */
  getContainers(): HTMLElement[] {
    return this.panes.map((pane) => pane.getContainer());
  }

  /**
   * Marks panes active when their id is listed; others become inactive.
   *
   * @param activeIds Pane ids that should remain active.
   */
  setActivePaneIds(activeIds: readonly string[]): void {
    const activeSet = new Set(activeIds);
    this.panes.forEach((pane) => {
      pane.setActive(activeSet.has(pane.getId()));
    });
    this.rebuildActiveRenderViewports();
  }

  /** Marks every pane active. */
  activateAllPanes(): void {
    this.panes.forEach((pane) => pane.setActive(true));
    this.rebuildActiveRenderViewports();
  }

  /**
   * Replaces the viewport kind in a pane by disposing the old instance and
   * creating a new one.
   *
   * @param paneId Target pane id.
   * @param kind Desired viewport kind.
   * @returns The new viewport instance, or null if the pane is missing.
   */
  replaceKind(paneId: string, kind: ViewportKind): EditorViewport | null {
    const pane = this.getPaneById(paneId);
    if (!pane) return null;
    this.disposeViewportInPane(pane);
    pane.setKind(kind);
    const created = this.createViewportInPane(pane, kind);
    this.rebuildActiveRenderViewports();
    return created;
  }

  /**
   * Disposes the live instance in a pane without removing the pane itself.
   *
   * @param paneId Target pane id.
   */
  clearViewport(paneId: string): void {
    const pane = this.getPaneById(paneId);
    if (!pane) return;
    this.disposeViewportInPane(pane);
    this.rebuildActiveRenderViewports();
  }

  /**
   * Disposes the viewport and removes the pane descriptor from the registry.
   *
   * @param paneId Target pane id.
   * @returns True when a pane was removed.
   */
  removePane(paneId: string): boolean {
    const index = this.panes.findIndex((pane) => pane.getId() === paneId);
    if (index < 0) return false;
    const pane = this.panes[index]!;
    this.disposeViewportInPane(pane);
    this.panes.splice(index, 1);
    this.rebuildActiveRenderViewports();
    return true;
  }

  /** Disposes every live viewport instance while keeping pane descriptors. */
  disposeAllViewports(): void {
    this.panes.forEach((pane) => this.disposeViewportInPane(pane));
    this.rebuildActiveRenderViewports();
  }

  /** Disposes all viewports and clears pane registration. */
  dispose(): void {
    this.disposeAllViewports();
    this.panes = [];
    this.activeRenderViewports = [];
    this.factoryDependencies = null;
  }

  /**
   * Rebuilds the cached multi-view list: active orthographic panes first, then
   * active perspective panes. Relative registration order is preserved within
   * each group so draw order stays stable for equal-projection panes.
   */
  private rebuildActiveRenderViewports(): void {
    const orthographic: EditorViewport[] = [];
    const perspective: EditorViewport[] = [];
    for (let i = 0; i < this.panes.length; i++) {
      const pane = this.panes[i];
      if (!pane || !pane.isActive()) continue;
      const viewport = pane.getViewport();
      if (!viewport) continue;
      if (isPerspectiveViewportKind(pane.getKind())) {
        perspective.push(viewport);
      } else {
        orthographic.push(viewport);
      }
    }
    this.activeRenderViewports = orthographic.concat(perspective);
  }

  /**
   * Creates a viewport for a pane and stores it.
   *
   * @param pane Target pane.
   * @param kind Kind to instantiate.
   * @returns Created viewport, or null when factory deps are missing.
   */
  private createViewportInPane(pane: ViewportPane, kind: ViewportKind): EditorViewport | null {
    if (!this.factoryDependencies) return null;
    const viewport = this.createViewport(kind, pane.getContainer(), this.factoryDependencies);
    viewport.setName(getViewportKindDisplayLabel(kind));
    viewport.setViewportKind(kind);
    this.applyCoordinateSpaceToViewport(viewport);
    pane.setViewport(viewport);
    pane.setKind(kind);
    return viewport;
  }

  /**
   * Disposes and clears the viewport stored on a pane.
   *
   * @param pane Pane whose instance should be removed.
   */
  private disposeViewportInPane(pane: ViewportPane): void {
    const viewport = pane.getViewport();
    if (!viewport) return;
    disposeEditorViewport(viewport);
    pane.setViewport(null);
  }

  /**
   * Applies coordinate visuals and a translated pane label.
   *
   * @param viewport Viewport to update.
   */
  private applyCoordinateSpaceToViewport(viewport: EditorViewport): void {
    const target = viewport as EditorViewport & {
      setCoordinateSpace?: (space: CoordinateSpaceDefinition) => void;
    };
    target.setCoordinateSpace?.(this.coordinateSpace);
    viewport.setName(buildCoordinateViewportLabel(viewport.getViewportKind(), this.coordinateSpace));
  }
}

/**
 * Builds a pane label that exposes non-default profile axes.
 *
 * @param kind Viewport kind.
 * @param space Active profile coordinate space.
 * @returns Pane label.
 */
function buildCoordinateViewportLabel(kind: ViewportKind, space: CoordinateSpaceDefinition): string {
  const base = getViewportKindDisplayLabel(kind);
  const adapter = new CoordinateSpaceAdapter(space);
  if (adapter.isIdentity()) return base;
  if (isPerspectiveViewportKind(kind)) return `${base} · ${space.name}`;
  const axes = profileAxesForPlane(getViewportKindMetadata(kind).gridPlane, adapter);
  return `${base} · ${axes.map((axis) => axis.toUpperCase()).join('/')}`;
}

/**
 * Resolves profile axes visible on an editor grid plane.
 *
 * @param plane Editor grid plane.
 * @param adapter Active coordinate adapter.
 * @returns Two profile axes.
 */
function profileAxesForPlane(
  plane: 'xy' | 'xz' | 'yz',
  adapter: CoordinateSpaceAdapter,
): [CoordinateAxis, CoordinateAxis] {
  const editorAxes: [CoordinateAxis, CoordinateAxis] =
    plane === 'xz' ? ['x', 'z'] : plane === 'xy' ? ['x', 'y'] : ['y', 'z'];
  return editorAxes.map((axis) => adapter.editorAxisToProfileAxis(axis)) as [CoordinateAxis, CoordinateAxis];
}
