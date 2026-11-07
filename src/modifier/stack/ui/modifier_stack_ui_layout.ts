/** DOM id of the style element holding modifier inspector layout rules. */
const MODIFIER_STACK_UI_STYLE_ID = 'modifier-stack-ui-stylesheet';

/** Class names of the modifier inspector layout. */
export const MODIFIER_STACK_UI_CLASSES = {
  root: 'modifier-stack-ui',
  row: 'modifier-stack-ui-row',
  toggle: 'modifier-stack-ui-row-toggle',
  label: 'modifier-stack-ui-label',
  control: 'modifier-stack-ui-control',
  caption: 'modifier-stack-ui-caption',
  ellipsis: 'modifier-stack-ui-ellipsis',
} as const;

/** Inspector width below which labels sit above their controls. */
export const MODIFIER_STACK_UI_STACK_BELOW_PX = 240;

/**
 * Injects the layout rules once. Colours stay inline so theme repaints keep
 * working; this sheet only arranges rows: a flexible label column beside a
 * control that fills the rest, stacked label-over-control in a narrow inspector
 * so neither labels nor values truncate.
 */
export function modifierStackUiStylesheetEnsure(): void {
  if (typeof document === 'undefined' || document.getElementById(MODIFIER_STACK_UI_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MODIFIER_STACK_UI_STYLE_ID;
  style.textContent = modifierStackUiLayoutCss();
  document.head.appendChild(style);
}

/**
 * Builds the layout rules.
 *
 * @returns CSS text.
 */
export function modifierStackUiLayoutCss(): string {
  const c = MODIFIER_STACK_UI_CLASSES;
  return `
.${c.root} { container-type: inline-size; container-name: modifier-stack; }
.${c.row} { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); align-items: center; column-gap: 8px; row-gap: 3px; padding: 0 8px 6px; box-sizing: border-box; }
.${c.row} > :nth-child(n+3) { grid-column: 1 / -1; }
.${c.row}.${c.toggle} { grid-template-columns: auto minmax(0, 1fr); column-gap: 6px; }
.${c.label}, .${c.ellipsis} { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${c.caption} { font-size: 10px !important; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 8px 4px; }
@container modifier-stack (max-width: ${MODIFIER_STACK_UI_STACK_BELOW_PX - 1}px) {
  .${c.row}:not(.${c.toggle}) { grid-template-columns: minmax(0, 1fr); }
  .${c.row}:not(.${c.toggle}) > .${c.label} { font-size: 11px !important; }
}`.trim();
}
