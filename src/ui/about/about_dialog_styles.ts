import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';

/** Style injection and visual helpers for the theme-aware About dialog. */

const STYLE_ELEMENT_ID = 'aiworlded-about-dialog-styles';

/** Ensures About dialog keyframe animations exist in the document once. */
export function ensureAboutDialogStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.textContent = buildKeyframeCss();
  document.head.appendChild(styleElement);
}

/**
 * Builds CSS keyframe and class rules for the About dialog.
 *
 * @returns CSS text for injection.
 */
function buildKeyframeCss(): string {
  return [
    buildBackdropKeyframes(),
    buildPanelKeyframes(),
    buildShimmerKeyframes(),
    buildSphereRollKeyframes(),
    buildClassRules(),
  ].join('\n');
}

/**
 * Backdrop fade animation.
 *
 * @returns CSS keyframes string.
 */
function buildBackdropKeyframes(): string {
  return `@keyframes aboutBackdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }`;
}

/**
 * Panel entrance animation with scale and rise.
 *
 * @returns CSS keyframes string.
 */
function buildPanelKeyframes(): string {
  return `@keyframes aboutPanelIn {
    from { opacity: 0; transform: translateY(18px) scale(0.94); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }`;
}

/**
 * Horizontal shimmer sweep over the header band.
 *
 * @returns CSS keyframes string.
 */
function buildShimmerKeyframes(): string {
  return `@keyframes aboutShimmer {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(120%); }
  }`;
}

/**
 * Contributor sphere roll-in animation from right to left with a bounce.
 *
 * @returns CSS keyframes string.
 */
function buildSphereRollKeyframes(): string {
  return `@keyframes contributorSphereRollIn {
    0% { opacity: 0; transform: translateX(80px) scale(0.3) rotate(0deg); }
    60% { opacity: 1; transform: translateX(-8px) scale(1.08) rotate(-8deg); }
    80% { transform: translateX(3px) scale(0.97) rotate(3deg); }
    100% { opacity: 1; transform: translateX(0) scale(1) rotate(0deg); }
  }`;
}

/**
 * Class rules that apply the keyframe animations.
 *
 * @returns CSS class rules string.
 */
function buildClassRules(): string {
  const selectionColor = hexToRgb(Theme.selectionColor);
  return `
.about-dialog-backdrop {
  animation: aboutBackdropIn 280ms ease-out forwards;
}
.about-dialog-panel {
  --about-accent: ${selectionColor};
  --about-text: ${Theme.buttonTextColor};
  --about-muted-text: ${Theme.inputTextColor};
  --about-subtitle: ${Theme.statusBarTextColor};
  --about-quote-text: ${Theme.inputTextColor};
  animation: aboutPanelIn 180ms ease-out forwards;
}
.about-dialog-title {
  color: var(--about-text);
}
.about-dialog-shimmer {
  animation: aboutShimmer 2.8s ease-in-out infinite;
}
html[data-aiworlded-theme='light'] .about-dialog-backdrop {
  background: rgba(240, 240, 240, 0.82) !important;
}
html[data-aiworlded-theme='light'] .about-dialog-panel {
  --about-accent: #0078d4;
  --about-text: #0a0a0a;
  --about-muted-text: #343434;
  --about-subtitle: #424242;
  --about-quote-text: #18364f;
  background: #ffffff !important;
  border-color: #8c8c8c !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18) !important;
}
html[data-aiworlded-theme='light'] .about-dialog-header {
  background: linear-gradient(135deg, #e5e5e5, #f7f7f7) !important;
  border-color: #c6c6c6 !important;
}
html[data-aiworlded-theme='light'] .about-dialog-title {
  color: #0a0a0a;
}
html[data-aiworlded-theme='light'] .about-dialog-quote {
  background: #e5f3ff !important;
  border-color: #8abce5 !important;
}
html[data-aiworlded-theme='light'] .about-dialog-license {
  background: #f7f7f7 !important;
  border-color: #8c8c8c !important;
  color: #343434 !important;
}
html[data-aiworlded-theme='light'] .about-dialog-action-secondary,
html[data-aiworlded-theme='light'] .about-dialog-close {
  background: #ffffff !important;
  border-color: #767676 !important;
  color: #0a0a0a !important;
}
html[data-aiworlded-theme='light'] .about-dialog-action-primary {
  background: #0078d4 !important;
  border-color: #005a9e !important;
  color: #ffffff !important;
}
html[data-aiworlded-theme='light'] .contributor-sphere {
  border-color: #0078d4 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22) !important;
}
`.trim();
}

/**
 * Applies fixed full-viewport overlay styles to the backdrop.
 *
 * @param backdrop Backdrop element.
 */
export function styleAboutBackdrop(backdrop: HTMLElement): void {
  backdrop.classList.add('about-dialog-backdrop');
  backdrop.style.position = 'fixed';
  backdrop.style.inset = '0';
  backdrop.style.zIndex = '12000';
  backdrop.style.display = 'none';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.padding = '24px';
  backdrop.style.background = 'rgba(0, 0, 0, 0.55)';
  backdrop.style.backdropFilter = 'blur(6px)';
}

/**
 * Applies chrome styles to the dialog panel card.
 *
 * @param panel Panel element.
 */
export function styleAboutPanel(panel: HTMLElement): void {
  panel.classList.add('about-dialog-panel');
  panel.style.position = 'relative';
  panel.style.width = 'min(520px, 100%)';
  panel.style.maxHeight = 'min(86vh, 720px)';
  panel.style.overflow = 'hidden';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.borderRadius = '8px';
  panel.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
  panel.style.background = hexToRgb(Theme.propertiesPanelBackground);
  panel.style.fontFamily = Theme.uiFontFamily;
  panel.style.color = 'var(--about-text)';
  panel.style.overflowY = 'auto';
  panel.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.55)';
}

/**
 * Applies styles to the animated header band.
 *
 * @param header Header container.
 */
export function styleAboutHeader(header: HTMLElement): void {
  header.classList.add('about-dialog-header');
  header.style.position = 'relative';
  header.style.overflow = 'hidden';
  header.style.padding = '22px 22px 16px';
  header.style.background = buildToolbarGradient();
  header.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
}

/**
 * Applies styles to the scrolling body content area.
 *
 * @param body Body container.
 */
export function styleAboutBody(body: HTMLElement): void {
  body.classList.add('about-dialog-body');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';
  body.style.padding = '16px 22px 20px';
}

/**
 * Applies animated gradient text styles to the project title.
 *
 * @param title Title element.
 */
export function styleAboutTitle(title: HTMLElement): void {
  title.classList.add('about-dialog-title');
  title.style.margin = '0';
  title.style.fontSize = '28px';
  title.style.fontWeight = '700';
  title.style.letterSpacing = '0.04em';
  title.style.lineHeight = '1.15';
}

/**
 * Applies muted subtitle styles.
 *
 * @param subtitle Subtitle element.
 */
export function styleAboutSubtitle(subtitle: HTMLElement): void {
  subtitle.classList.add('about-dialog-subtitle');
  subtitle.style.margin = '8px 0 0';
  subtitle.style.fontSize = '12px';
  subtitle.style.letterSpacing = '0.12em';
  subtitle.style.textTransform = 'uppercase';
  subtitle.style.color = 'var(--about-subtitle)';
}

/**
 * Applies styles to credit paragraphs.
 *
 * @param paragraph Credit text element.
 */
export function styleAboutCreditLine(paragraph: HTMLElement): void {
  paragraph.classList.add('about-dialog-credit-line');
  paragraph.style.margin = '0';
  paragraph.style.fontSize = '13px';
  paragraph.style.lineHeight = '1.55';
  paragraph.style.color = 'var(--about-muted-text)';
}

/**
 * Applies styles to the rotating Portal quote.
 *
 * @param quote Quote element.
 */
export function styleAboutQuote(quote: HTMLElement): void {
  quote.classList.add('about-dialog-quote');
  quote.style.margin = '0';
  quote.style.padding = '10px 12px';
  quote.style.borderRadius = '8px';
  quote.style.fontSize = '12px';
  quote.style.lineHeight = '1.5';
  quote.style.fontStyle = 'italic';
  quote.style.color = 'var(--about-quote-text)';
  quote.style.background = hexToRgb(Theme.toolbarBackground);
  quote.style.border = `1px solid ${Theme.inputBorderColor}`;
}

/**
 * Applies styles to the license textarea.
 *
 * @param textArea License text area.
 */
export function styleAboutLicenseBox(textArea: HTMLTextAreaElement): void {
  textArea.classList.add('about-dialog-license');
  textArea.style.width = '100%';
  textArea.style.minHeight = '140px';
  textArea.style.resize = 'vertical';
  textArea.style.boxSizing = 'border-box';
  textArea.style.padding = '10px';
  textArea.style.borderRadius = '8px';
  textArea.style.border = `1px solid ${Theme.inputBorderColor}`;
  textArea.style.background = Theme.inputBackgroundColor;
  textArea.style.color = Theme.inputTextColor;
  textArea.style.fontFamily = 'Consolas, ui-monospace, monospace';
  textArea.style.fontSize = '11px';
  textArea.style.lineHeight = '1.4';
  textArea.style.outline = 'none';
}

/**
 * Applies styles to primary action buttons (Discord / Close).
 *
 * @param button Button element.
 * @param primary Whether this is the accent primary action.
 */
export function styleAboutActionButton(button: HTMLButtonElement, primary: boolean): void {
  button.classList.add(primary ? 'about-dialog-action-primary' : 'about-dialog-action-secondary');
  button.type = 'button';
  button.style.cursor = 'pointer';
  button.style.border = '1px solid transparent';
  button.style.borderRadius = '8px';
  button.style.padding = '8px 14px';
  button.style.fontSize = '12px';
  button.style.fontWeight = '600';
  button.style.fontFamily = 'inherit';
  button.style.transition = 'transform 120ms ease, filter 120ms ease';
  applyAboutButtonPalette(button, primary);
  bindAboutButtonHover(button);
}

/**
 * Sets fill and border colors for an About action button.
 *
 * @param button Button element.
 * @param primary Whether the orange primary palette is used.
 */
function applyAboutButtonPalette(button: HTMLButtonElement, primary: boolean): void {
  if (primary) {
    button.style.background = hexToRgb(Theme.selectionColor);
    button.style.color = '#ffffff';
    button.style.borderColor = hexToRgb(Theme.selectionColor);
    return;
  }
  button.style.background = hexToRgb(Theme.buttonBackground);
  button.style.color = Theme.buttonTextColor;
  button.style.borderColor = Theme.inputBorderColor;
}

/**
 * Binds subtle hover lift feedback to an About action button.
 *
 * @param button Button element.
 */
function bindAboutButtonHover(button: HTMLButtonElement): void {
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-1px)';
    button.style.filter = 'brightness(1.08)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
    button.style.filter = 'none';
  });
}

/**
 * Applies styles to the footer action row.
 *
 * @param row Footer row element.
 */
export function styleAboutFooter(row: HTMLElement): void {
  row.classList.add('about-dialog-footer');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '8px';
  row.style.justifyContent = 'flex-end';
  row.style.marginTop = '4px';
}

/**
 * Applies styles to the close icon in the header.
 *
 * @param closeButton Close button element.
 */
export function styleAboutCloseButton(closeButton: HTMLButtonElement): void {
  closeButton.classList.add('about-dialog-close');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '12px';
  closeButton.style.width = '28px';
  closeButton.style.height = '28px';
  closeButton.style.border = `1px solid ${Theme.inputBorderColor}`;
  closeButton.style.borderRadius = '4px';
  closeButton.style.background = hexToRgb(Theme.buttonBackground);
  closeButton.style.color = Theme.buttonTextColor;
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '18px';
  closeButton.style.lineHeight = '1';
}

/**
 * Creates the shimmer sweep overlay element for the header.
 *
 * @returns Shimmer div element.
 */
export function createAboutShimmer(): HTMLElement {
  const shimmer = document.createElement('div');
  shimmer.classList.add('about-dialog-shimmer');
  shimmer.style.position = 'absolute';
  shimmer.style.top = '0';
  shimmer.style.left = '0';
  shimmer.style.width = '45%';
  shimmer.style.height = '100%';
  shimmer.style.pointerEvents = 'none';
  shimmer.style.background = 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)';
  return shimmer;
}

/**
 * Builds the toolbar gradient shared by the editor's modal chrome.
 *
 * @returns Toolbar background gradient.
 */
function buildToolbarGradient(): string {
  const startColor = hexToRgb(Theme.toolbarBackground);
  const endColor = hexToRgb(Theme.toolbarBackgroundEnd);
  return `linear-gradient(180deg, ${startColor} 0%, ${endColor} 100%)`;
}
