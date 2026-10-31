import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/** Tone of a feedback line. */
export type UiCollaborationTone = 'normal' | 'muted' | 'good' | 'bad';

/** Text colors per tone. */
const UI_COLLABORATION_TONES: Readonly<Record<UiCollaborationTone, string>> = {
  normal: '#e6e6e6',
  muted: '#9a9a9a',
  good: '#7fd18b',
  bad: '#ff8a7a',
};

/**
 * Applies the dark dialog card chrome.
 *
 * @param root Dialog root.
 * @param width Preferred width in pixels.
 */
export function uiCollaborationChrome(root: HTMLElement, width: number): void {
  root.style.width = `${width}px`;
  root.style.maxWidth = 'calc(100vw - 32px)';
  root.style.padding = '18px 20px 16px';
  root.style.borderRadius = '10px';
  root.style.background = `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`;
  root.style.border = '1px solid rgba(255,255,255,0.1)';
  root.style.boxShadow = '0 18px 48px rgba(0,0,0,0.65)';
  root.style.color = Theme.buttonTextColor;
  root.style.boxSizing = 'border-box';
  root.style.fontFamily = Theme.uiFontFamily;
  root.style.fontSize = '12px';
}

/**
 * Creates a dialog title.
 *
 * @param text Title text.
 * @returns Heading element.
 */
export function uiCollaborationTitle(text: string): HTMLElement {
  const title = document.createElement('h2');
  title.textContent = text;
  title.style.margin = '0 0 12px';
  title.style.fontSize = '15px';
  title.style.fontWeight = '600';
  title.style.color = '#f0f0f0';
  return title;
}

/**
 * Creates a text line.
 *
 * @param text Content.
 * @param tone Color tone.
 * @returns Paragraph element.
 */
export function uiCollaborationText(text: string, tone: UiCollaborationTone = 'normal'): HTMLElement {
  const line = document.createElement('p');
  line.style.margin = '6px 0';
  line.style.lineHeight = '1.45';
  line.style.whiteSpace = 'pre-wrap';
  uiCollaborationTextSet(line, text, tone);
  return line;
}

/**
 * Changes a text line.
 *
 * @param line Paragraph element.
 * @param text Content.
 * @param tone Color tone.
 */
export function uiCollaborationTextSet(line: HTMLElement, text: string, tone: UiCollaborationTone): void {
  line.textContent = text;
  line.style.color = UI_COLLABORATION_TONES[tone];
  line.style.display = text === '' ? 'none' : 'block';
}

/**
 * Creates a button.
 *
 * @param label Caption.
 * @param primary True for the main action.
 * @param onClick Click handler.
 * @returns Button element.
 */
export function uiCollaborationButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.minWidth = '72px';
  button.style.padding = '6px 12px';
  button.style.borderRadius = '6px';
  button.style.border = primary ? `1px solid ${hexToRgb(Theme.selectionColor)}` : '1px solid rgba(255,255,255,0.12)';
  button.style.background = primary ? 'rgba(232, 106, 23, 0.28)' : 'rgba(255,255,255,0.06)';
  button.style.color = '#f2f2f2';
  button.style.cursor = 'pointer';
  button.style.fontFamily = Theme.uiFontFamily;
  button.style.fontSize = '12px';
  button.style.fontWeight = '600';
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Creates a text input.
 *
 * @param value Initial value.
 * @param maxLength Maximum length.
 * @param type Input type.
 * @returns Input element.
 */
export function uiCollaborationInput(value: string, maxLength: number, type: string = 'text'): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.maxLength = maxLength;
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.style.flex = '1';
  input.style.minWidth = '0';
  input.style.padding = '6px 8px';
  input.style.borderRadius = '5px';
  input.style.border = '1px solid rgba(255,255,255,0.14)';
  input.style.background = 'rgba(0,0,0,0.35)';
  input.style.color = '#f0f0f0';
  input.style.fontFamily = Theme.uiFontFamily;
  input.style.fontSize = '12px';
  return input;
}

/**
 * Creates a labelled row.
 *
 * @param label Caption.
 * @param controls Controls placed after the caption.
 * @returns Row element.
 */
export function uiCollaborationField(label: string, ...controls: HTMLElement[]): HTMLElement {
  const row = document.createElement('label');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';
  row.style.margin = '8px 0';
  const caption = document.createElement('span');
  caption.textContent = label;
  caption.style.width = '92px';
  caption.style.flex = '0 0 auto';
  caption.style.color = '#bdbdbd';
  row.append(caption, ...controls);
  return row;
}

/**
 * Creates a right-aligned button row.
 *
 * @param buttons Buttons.
 * @returns Row element.
 */
export function uiCollaborationButtons(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'flex-end';
  row.style.gap = '8px';
  row.style.marginTop = '14px';
  row.append(...buttons);
  return row;
}

/**
 * Creates a colored dot.
 *
 * @param color CSS color.
 * @returns Dot element.
 */
export function uiCollaborationDot(color: string): HTMLElement {
  const dot = document.createElement('span');
  dot.style.display = 'inline-block';
  dot.style.width = '9px';
  dot.style.height = '9px';
  dot.style.borderRadius = '50%';
  dot.style.background = color;
  dot.style.flex = '0 0 auto';
  return dot;
}
