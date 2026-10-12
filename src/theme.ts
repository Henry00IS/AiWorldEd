/**
 * Editor theme tokens (Blender-inspired dark UI). Frozen so runtime code cannot
 * mutate shared palette values.
 */
export const Theme = Object.freeze({
  background: 0x1d1d1d,
  viewportBackground: 0x232323,
  gridColor: 0x3a3a3a,
  gridOriginColor: 0x555555,
  gridXAxisColor: 0x8b0000,
  gridYAxisColor: 0x006400,
  gridZAxisColor: 0x00008b,
  selectionColor: 0xe86a17,
  /** Amber warning for coincident edit vertices. */
  vertexCoincidentWarningColor: 0xf0c419,
  /** Legacy single clip marker color (point 1 fallback). */
  clipMarkerColor: 0xf0b429,
  /**
   * Clip placement points — warm amber / cool teal / soft violet for contrast
   * on dark viewports without neon glare.
   */
  clipPoint1Color: 0xf0b429,
  clipPoint2Color: 0x3db8c9,
  clipPoint3Color: 0xc48ad9,
  /** Keep-side half-brush preview fill (muted forest). */
  clipKeepColor: 0x3a8f6e,
  /** Discard-side half-brush preview fill (stronger coral, readable ghost). */
  clipDiscardColor: 0xe45b4c,
  /** Thin construction polyline between clip points (steel, not bright white). */
  clipConstructionLineColor: 0x7a8a9a,
  /** Plane∩brush cut edge silhouette (selection orange family). */
  clipCutEdgeColor: 0xe07a2f,
  separatorColor: 0x0a0a0a,
  separatorGapPx: 4,
  boxColor: 0xffffff,
  boxEdgeColor: 0xaaaaaa,
  lightAmbient: 0xffffff,
  lightDirectional: 0xffffff,
  viewportLabelTextColor: '#c8c8c8',
  viewportLabelBackgroundColor: 'rgba(0, 0, 0, 0.5)',
  widgetXAxisColor: 0xff3333,
  widgetYAxisColor: 0x33ff33,
  widgetZAxisColor: 0x3333ff,
  widgetBackgroundColor: 0x1a1a2e,
  toolbarBackground: 0x202020,
  toolbarBackgroundEnd: 0x1a1a1a,
  outlinerBackground: 0x1a1a1a,
  buttonBackground: 0x2d2d2d,
  buttonHoverColor: 0x3a3a3a,
  buttonTextColor: '#e0e0e0',
  /** Dim suffix for auto hex ids in the outliner (e.g. ".001" after Brush). */
  outlinerNameIdColor: '#6a6a6a',
  outlinerSelectedColor: 'rgba(232, 106, 23, 0.3)',
  gizmoXAxisColor: 0xff3333,
  gizmoYAxisColor: 0x33ff33,
  gizmoZAxisColor: 0x3333ff,
  /** Free-move center handle on the translate gizmo (Unity-style). */
  gizmoCenterColor: 0xd8d8d8,
  gizmoHoverColor: 0xffffff,
  boundsWireColor: 0x66c2ff,
  /** Quiet steel fill for CAD-style mid-face resize grips (not axis candy). */
  boundsHandleColor: 0x8fa8bc,
  /** Hover / active color for bounds resize grips. */
  boundsHandleHoverColor: 0xe86a17,
  /** CAD size-dimension lines and ticks (cool cyan). */
  rulerSizeColor: 0x5ec8ff,
  /** CAD drag-delta total path (selection orange). */
  rulerDeltaColor: 0xe86a17,
  /** Ghost bounds wireframe while transforming (muted steel). */
  rulerGhostColor: 0x6a7a8a,
  /** Construction rays that point at measured corners. */
  rulerExtensionColor: 0x8a9aaa,
  /** DOM label text for size dimensions. */
  rulerLabelSizeText: '#9ee0ff',
  /** DOM label text for drag deltas. */
  rulerLabelDeltaText: '#ffb070',
  /** DOM label chip background for ruler text. */
  rulerLabelBackground: 'rgba(12, 14, 18, 0.82)',
  /** DOM label chip border for ruler text. */
  rulerLabelBorder: 'rgba(120, 160, 200, 0.35)',
  propertiesPanelBackground: 0x1a1a1a,
  inputBackgroundColor: '#2a2a2a',
  inputTextColor: '#cccccc',
  inputBorderColor: '#444444',
  statusBarBackground: '#1a1a1a',
  statusBarTextColor: '#888888',
  statusBarBorderColor: '#333333',
  uiFontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
  toolbarHeightPx: 40,
  viewportToolbarHeightPx: 28,
  /**
   * Reserved vertical space for the content-sized tool options bar under the
   * viewport title toolbar (used to place the floating tool rail below it).
   */
  viewportToolOptionsBarHeightPx: 36,
  /**
   * Shared control height for options-bar buttons and the mode dropdown
   * (matches Solid / Wireframe icon buttons on the viewport title toolbar).
   */
  viewportToolOptionsControlHeightPx: 24,
  /**
   * Width of the Shape Editor–style floating tool panel on each viewport
   * (primary tool icons only; height is content-sized).
   */
  viewportToolFloatingWidthPx: 40,
  /** Inset of the floating tool panel below the options bar. */
  viewportToolFloatingOffsetTopPx: 10,
  /** Inset of the floating tool panel from the left of the content area. */
  viewportToolFloatingOffsetLeftPx: 10,
  viewportToolbarBackground: 'rgba(22, 22, 26, 0.92)',
  viewportToolbarBorder: 'rgba(255, 255, 255, 0.06)',
  viewportToolbarSeparator: 'rgba(255, 255, 255, 0.12)',
  viewportToolbarButtonHover: 'rgba(255, 255, 255, 0.08)',
});
