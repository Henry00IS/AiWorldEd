import { Theme } from '@/theme.js';
import { resolveUiThemeId, type UiThemeId } from '@/ui/theme/theme_ui_palette.js';

/** Viewport rendering colors for one UI theme, as numeric hex colors. */
export interface ThemeViewportPalette {
  /** Flat clear color of each viewport pane, also the grid fade target. */
  viewportBackground: number;
  /** Top color of the soft background gradient, or null for a flat clear. */
  viewportGradientTop: number | null;
  /** Bottom color of the soft background gradient, or null for a flat clear. */
  viewportGradientBottom: number | null;
  /** Clear color behind the panes, visible as the separators between them. */
  separatorColor: number;
  /** Minor grid line color. */
  gridColor: number;
  /** Section and origin grid line color. */
  gridOriginColor: number;
  /** Grid X axis line color. */
  gridXAxisColor: number;
  /** Grid Y axis line color. */
  gridYAxisColor: number;
  /** Grid Z axis line color. */
  gridZAxisColor: number;
  /** Camera orientation widget X arrow color. */
  widgetXAxisColor: number;
  /** Camera orientation widget Y arrow color. */
  widgetYAxisColor: number;
  /** Camera orientation widget Z arrow color. */
  widgetZAxisColor: number;
  /** Decorative content edge outline color. */
  boxEdgeColor: number;
  /** Final mesh triangle wireframe color over shaded surfaces. */
  meshWireframeColor: number;
  /** Final mesh triangle wireframe color where surfaces are not drawn. */
  meshWireframeSeeThroughColor: number;
  /** Ruler size-dimension line color. */
  rulerSizeColor: number;
  /** Ruler construction ray color. */
  rulerExtensionColor: number;
  /** Ruler drag-delta path color. */
  rulerDeltaColor: number;
  /** Ruler ghost bounds color while transforming. */
  rulerGhostColor: number;
}

/** Dark viewport palette, identical to the original editor theme tokens. */
const THEME_VIEWPORT_PALETTE_DARK: ThemeViewportPalette = Object.freeze({
  viewportBackground: Theme.viewportBackground,
  viewportGradientTop: null,
  viewportGradientBottom: null,
  separatorColor: Theme.separatorColor,
  gridColor: Theme.gridColor,
  gridOriginColor: Theme.gridOriginColor,
  gridXAxisColor: Theme.gridXAxisColor,
  gridYAxisColor: Theme.gridYAxisColor,
  gridZAxisColor: Theme.gridZAxisColor,
  widgetXAxisColor: Theme.widgetXAxisColor,
  widgetYAxisColor: Theme.widgetYAxisColor,
  widgetZAxisColor: Theme.widgetZAxisColor,
  boxEdgeColor: Theme.boxEdgeColor,
  meshWireframeColor: Theme.meshWireframeColor,
  meshWireframeSeeThroughColor: Theme.meshWireframeSeeThroughColor,
  rulerSizeColor: Theme.rulerSizeColor,
  rulerExtensionColor: Theme.rulerExtensionColor,
  rulerDeltaColor: Theme.rulerDeltaColor,
  rulerGhostColor: Theme.rulerGhostColor,
});

/** Professional light viewport palette: soft grey gradient, quiet grid. */
const THEME_VIEWPORT_PALETTE_LIGHT: ThemeViewportPalette = Object.freeze({
  viewportBackground: 0xe6e8eb,
  viewportGradientTop: 0xf7f8f9,
  viewportGradientBottom: 0xd9dce0,
  separatorColor: 0xc4c7cb,
  gridColor: 0xc9ccd1,
  gridOriginColor: 0xa4a8ae,
  gridXAxisColor: 0xd0463f,
  gridYAxisColor: 0x3f9a45,
  gridZAxisColor: 0x2f6bd0,
  widgetXAxisColor: 0xe0362f,
  widgetYAxisColor: 0x2e9e3a,
  widgetZAxisColor: 0x2463d6,
  boxEdgeColor: 0x5c6168,
  meshWireframeColor: 0x2a2e33,
  meshWireframeSeeThroughColor: 0x3a4048,
  rulerSizeColor: 0x0b7fc4,
  rulerExtensionColor: 0x6f7d8a,
  rulerDeltaColor: 0xd45a10,
  rulerGhostColor: 0x7a8794,
});

/**
 * Returns the viewport palette for a concrete theme id.
 *
 * @param themeId Light or dark theme id.
 * @returns Matching viewport palette.
 */
export function getThemeViewportPalette(themeId: UiThemeId): ThemeViewportPalette {
  return themeId === 'light' ? THEME_VIEWPORT_PALETTE_LIGHT : THEME_VIEWPORT_PALETTE_DARK;
}

/**
 * Returns the viewport palette for the theme applied to the document root.
 *
 * @returns Active viewport palette, dark when no document is present.
 */
export function getActiveThemeViewportPalette(): ThemeViewportPalette {
  if (typeof document === 'undefined' || !document.documentElement) {
    return THEME_VIEWPORT_PALETTE_DARK;
  }
  return getThemeViewportPalette(resolveUiThemeId(document.documentElement));
}
