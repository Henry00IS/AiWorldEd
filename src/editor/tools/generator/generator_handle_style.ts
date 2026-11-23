import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { Theme } from '@/theme.js';

/** Colour of a hovered handle's dot: the orange of a hovered Bounds handle. */
export const GENERATOR_HANDLE_HOVER_COLOR = `#${Theme.selectionColor.toString(16).padStart(6, '0')}`;

/** Inline style of a ruler line. */
export const GENERATOR_HANDLE_RULER_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  height: '0',
  borderTop: `1px dashed ${ThemeCss.textColor}`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
  zIndex: '4',
  opacity: '0.7',
};

/** Inline style of a handle: a dot with its caption beside it. */
export const GENERATOR_HANDLE_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  transform: 'translate(-7px, -50%)',
  pointerEvents: 'none',
  zIndex: '5',
  paddingLeft: '18px',
  backgroundRepeat: 'no-repeat',
  color: ThemeCss.textColor,
  font: '12px sans-serif',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
