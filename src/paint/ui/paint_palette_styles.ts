import { Theme } from '@/theme.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { onUiThemeChromeRefresh } from '@/ui/theme/theme_ui_refresh.js';

/** DOM id of the style element that holds the paint palette CSS. */
const PAINT_PALETTE_STYLE_ELEMENT_ID = 'editor-paint-palette-stylesheet';

/** CSS class prefix shared by paint palette elements. */
export const PAINT_PALETTE_CLASS = 'editor-paint-palette';

let paintPaletteThemeHooked = false;

/** Injects or refreshes the paint palette CSS and follows theme changes. */
export function paintPaletteStylesheetEnsure(): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById(PAINT_PALETTE_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = PAINT_PALETTE_STYLE_ELEMENT_ID;
    document.head.appendChild(style);
  }
  style.textContent = paintPaletteCss();
  if (!paintPaletteThemeHooked) {
    paintPaletteThemeHooked = true;
    onUiThemeChromeRefresh(() => {
      const current = document.getElementById(PAINT_PALETTE_STYLE_ELEMENT_ID);
      if (current) current.textContent = paintPaletteCss();
    });
  }
}

/**
 * Builds the palette CSS from the active theme.
 *
 * @returns CSS rules.
 */
function paintPaletteCss(): string {
  const palette = getActiveUiThemePalette();
  const c = PAINT_PALETTE_CLASS;
  const accent = palette.selectionBorderColor;
  return `
.${c} { position: absolute; left: 0; right: 0; bottom: 14px; margin: 0 auto; width: max-content; z-index: 30; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; max-width: calc(100% - 24px);
  background: ${palette.panelBackground}; color: ${palette.panelTextColor}; border: 1px solid ${palette.panelBorderColor};
  border-radius: 10px; box-shadow: ${palette.menuBoxShadow}; font-family: ${Theme.uiFontFamily}; font-size: 11px;
  user-select: none; pointer-events: auto; animation: ${c}-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.${c}[hidden] { display: none; }
@keyframes ${c}-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.${c}-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; row-gap: 8px; }
.${c}-group { display: flex; align-items: center; gap: 4px; }
.${c}-divider { width: 1px; align-self: stretch; background: ${palette.panelBorderColorInner}; }
.${c}-button { box-sizing: border-box; height: 28px; min-width: 28px; padding: 0 8px; display: inline-flex; align-items: center;
  justify-content: center; gap: 6px; border-radius: 6px; border: 1px solid ${palette.controlBorderColor};
  background: ${palette.controlBackground}; color: ${palette.controlTextColor}; font: inherit; cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease; }
.${c}-button:hover { background: ${palette.controlHoverBackground}; border-color: ${palette.controlHoverBorderColor}; }
.${c}-button:active { transform: scale(0.96); }
.${c}-button[aria-pressed="true"] { border-color: ${accent}; background: ${palette.dialogTabActiveBackground}; color: ${palette.dialogTabActiveTextColor}; }
.${c}-button:focus-visible, .${c}-swatch:focus-visible, .${c}-chip:focus-visible, .${c} input:focus-visible, .${c} select:focus-visible {
  outline: 2px solid ${palette.focusOutlineColor}; outline-offset: 1px; }
.${c}-button svg { width: 16px; height: 16px; }
.${c}-color { position: relative; width: 34px; height: 34px; border-radius: 8px; border: 2px solid ${palette.controlBorderColor};
  cursor: pointer; padding: 0; box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); transition: transform 120ms ease; }
.${c}-color:hover { transform: scale(1.06); }
.${c}-color input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; padding: 0; }
.${c}-swatches { display: grid; grid-template-columns: repeat(5, 14px); grid-auto-rows: 14px; gap: 3px; }
.${c}-swatch { width: 14px; height: 14px; padding: 0; border-radius: 4px; border: 1px solid rgba(0,0,0,0.35); cursor: pointer;
  transition: transform 100ms ease; }
.${c}-swatch:hover { transform: scale(1.18); }
.${c}-slider { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 8px; row-gap: 2px; width: 118px; }
.${c}-slider label { color: ${palette.menuMutedColor}; }
.${c}-slider output { justify-self: end; font-variant-numeric: tabular-nums; }
.${c}-slider input[type="range"] { grid-column: 1 / span 2; width: 100%; margin: 0; accent-color: ${palette.rangeAccentColor}; cursor: pointer; }
.${c}-chip { box-sizing: border-box; width: 34px; height: 34px; padding: 2px; border-radius: 7px; border: 1px solid ${palette.controlBorderColor};
  background: ${palette.controlBackground}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease; }
.${c}-chip:hover { background: ${palette.controlHoverBackground}; transform: translateY(-1px); }
.${c}-chip[aria-pressed="true"] { border-color: ${accent}; background: ${palette.dialogTabActiveBackground}; }
.${c}-chip canvas { width: 26px; height: 26px; }
.${c}-field { display: flex; flex-direction: column; gap: 2px; }
.${c}-field label { color: ${palette.menuMutedColor}; }
.${c}-field select { height: 24px; max-width: 150px; border-radius: 5px; border: 1px solid ${palette.inputBorderColor};
  background: ${palette.inputBackground}; color: ${palette.inputTextColor}; font: inherit; }
.${c}-title { font-weight: 600; letter-spacing: 0.02em; color: ${palette.panelTextColor}; margin-right: 4px; }
.${c}-erase-hint { color: ${palette.menuMutedColor}; }
@media (prefers-reduced-motion: reduce) {
  .${c}, .${c}-button, .${c}-color, .${c}-swatch, .${c}-chip { animation: none; transition: none; }
  .${c}-button:active, .${c}-color:hover, .${c}-swatch:hover, .${c}-chip:hover { transform: none; }
}`.trim();
}
