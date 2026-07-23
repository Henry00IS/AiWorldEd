/**
 * Style injection and visual helpers for the fancy About dialog.
 * Dark blue Blender-inspired chrome with orange selection accents.
 */

const STYLE_ELEMENT_ID = 'aiworlded-about-dialog-styles';

/**
 * Ensures About dialog keyframe animations exist in the document once.
 */
export function ensureAboutDialogStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.textContent = buildKeyframeCss();
  document.head.appendChild(styleElement);
}

/**
 * Builds CSS keyframe and class rules for the About dialog.
 * @returns CSS text for injection.
 */
function buildKeyframeCss(): string {
  return [
    buildBackdropKeyframes(),
    buildPanelKeyframes(),
    buildTitleKeyframes(),
    buildGlowKeyframes(),
    buildShimmerKeyframes(),
    buildClassRules()
  ].join('\n');
}

/**
 * Backdrop fade animation.
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
 * @returns CSS keyframes string.
 */
function buildPanelKeyframes(): string {
  return `@keyframes aboutPanelIn {
    from { opacity: 0; transform: translateY(18px) scale(0.94); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }`;
}

/**
 * Animated gradient shift for the project title.
 * @returns CSS keyframes string.
 */
function buildTitleKeyframes(): string {
  return `@keyframes aboutTitleShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }`;
}

/**
 * Soft border glow pulse.
 * @returns CSS keyframes string.
 */
function buildGlowKeyframes(): string {
  return `@keyframes aboutGlowPulse {
    0%, 100% { box-shadow: 0 0 18px rgba(232,106,23,0.25), 0 0 48px rgba(40,80,180,0.2); }
    50% { box-shadow: 0 0 28px rgba(232,106,23,0.45), 0 0 64px rgba(60,120,255,0.35); }
  }`;
}

/**
 * Horizontal shimmer sweep over the header band.
 * @returns CSS keyframes string.
 */
function buildShimmerKeyframes(): string {
  return `@keyframes aboutShimmer {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(120%); }
  }`;
}

/**
 * Class rules that apply the keyframe animations.
 * @returns CSS class rules string.
 */
function buildClassRules(): string {
  return `
.about-dialog-backdrop {
  animation: aboutBackdropIn 280ms ease-out forwards;
}
.about-dialog-panel {
  animation: aboutPanelIn 360ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards,
             aboutGlowPulse 3.2s ease-in-out infinite 360ms;
}
.about-dialog-title {
  background: linear-gradient(90deg, #ff9a3c, #e86a17, #6eb6ff, #e86a17, #ff9a3c);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: aboutTitleShift 6s ease-in-out infinite;
}
.about-dialog-shimmer {
  animation: aboutShimmer 2.8s ease-in-out infinite;
}
`.trim();
}

/**
 * Applies fixed full-viewport overlay styles to the backdrop.
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
  backdrop.style.background =
    'radial-gradient(ellipse at center, rgba(20,28,55,0.82) 0%, rgba(6,8,14,0.94) 70%)';
  backdrop.style.backdropFilter = 'blur(6px)';
}

/**
 * Applies chrome styles to the dialog panel card.
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
  panel.style.borderRadius = '14px';
  panel.style.border = '1px solid rgba(232, 106, 23, 0.45)';
  panel.style.background =
    'linear-gradient(165deg, #1a2238 0%, #12141c 42%, #0e1018 100%)';
  panel.style.fontFamily = 'Segoe UI, system-ui, -apple-system, sans-serif';
  panel.style.color = '#e0e0e0';
  panel.style.overflowY = 'auto';
}

/**
 * Applies styles to the animated header band.
 * @param header Header container.
 */
export function styleAboutHeader(header: HTMLElement): void {
  header.style.position = 'relative';
  header.style.overflow = 'hidden';
  header.style.padding = '22px 22px 16px';
  header.style.background =
    'linear-gradient(135deg, rgba(40,70,140,0.45) 0%, rgba(20,24,40,0.9) 55%, rgba(232,106,23,0.18) 100%)';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
}

/**
 * Applies styles to the scrolling body content area.
 * @param body Body container.
 */
export function styleAboutBody(body: HTMLElement): void {
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '12px';
  body.style.padding = '16px 22px 20px';
}

/**
 * Applies animated gradient text styles to the project title.
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
 * @param subtitle Subtitle element.
 */
export function styleAboutSubtitle(subtitle: HTMLElement): void {
  subtitle.style.margin = '8px 0 0';
  subtitle.style.fontSize = '12px';
  subtitle.style.letterSpacing = '0.12em';
  subtitle.style.textTransform = 'uppercase';
  subtitle.style.color = 'rgba(180, 200, 255, 0.75)';
}

/**
 * Applies styles to credit paragraphs.
 * @param paragraph Credit text element.
 */
export function styleAboutCreditLine(paragraph: HTMLElement): void {
  paragraph.style.margin = '0';
  paragraph.style.fontSize = '13px';
  paragraph.style.lineHeight = '1.55';
  paragraph.style.color = '#c8cdd8';
}

/**
 * Applies styles to the AI supremacy proclamation.
 * @param proclamation Proclamation element.
 */
export function styleAboutProclamation(proclamation: HTMLElement): void {
  proclamation.style.margin = '0';
  proclamation.style.padding = '10px 12px';
  proclamation.style.borderRadius = '8px';
  proclamation.style.fontSize = '12px';
  proclamation.style.lineHeight = '1.5';
  proclamation.style.fontStyle = 'italic';
  proclamation.style.color = '#f0d0b0';
  proclamation.style.background =
    'linear-gradient(90deg, rgba(232,106,23,0.16), rgba(40,80,180,0.18))';
  proclamation.style.border = '1px solid rgba(232,106,23,0.28)';
}

/**
 * Applies styles to the license textarea.
 * @param textArea License text area.
 */
export function styleAboutLicenseBox(textArea: HTMLTextAreaElement): void {
  textArea.style.width = '100%';
  textArea.style.minHeight = '140px';
  textArea.style.resize = 'vertical';
  textArea.style.boxSizing = 'border-box';
  textArea.style.padding = '10px';
  textArea.style.borderRadius = '8px';
  textArea.style.border = '1px solid rgba(255,255,255,0.12)';
  textArea.style.background =
    'linear-gradient(180deg, #0c0e14 0%, #141820 100%)';
  textArea.style.color = '#9aa3b5';
  textArea.style.fontFamily = 'Consolas, ui-monospace, monospace';
  textArea.style.fontSize = '11px';
  textArea.style.lineHeight = '1.4';
  textArea.style.outline = 'none';
}

/**
 * Applies styles to primary action buttons (Discord / Close).
 * @param button Button element.
 * @param primary Whether this is the accent primary action.
 */
export function styleAboutActionButton(
  button: HTMLButtonElement,
  primary: boolean
): void {
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
 * @param button Button element.
 * @param primary Whether the orange primary palette is used.
 */
function applyAboutButtonPalette(
  button: HTMLButtonElement,
  primary: boolean
): void {
  if (primary) {
    button.style.background =
      'linear-gradient(180deg, #f08a3a 0%, #e86a17 100%)';
    button.style.color = '#1a1208';
    button.style.borderColor = 'rgba(255,200,140,0.35)';
    return;
  }
  button.style.background = 'rgba(255,255,255,0.06)';
  button.style.color = '#e0e0e0';
  button.style.borderColor = 'rgba(255,255,255,0.12)';
}

/**
 * Binds subtle hover lift feedback to an About action button.
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
 * @param row Footer row element.
 */
export function styleAboutFooter(row: HTMLElement): void {
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '8px';
  row.style.justifyContent = 'flex-end';
  row.style.marginTop = '4px';
}

/**
 * Applies styles to the close icon in the header.
 * @param closeButton Close button element.
 */
export function styleAboutCloseButton(closeButton: HTMLButtonElement): void {
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.style.position = 'absolute';
  closeButton.style.top = '10px';
  closeButton.style.right = '12px';
  closeButton.style.width = '28px';
  closeButton.style.height = '28px';
  closeButton.style.border = '1px solid rgba(255,255,255,0.1)';
  closeButton.style.borderRadius = '6px';
  closeButton.style.background = 'rgba(0,0,0,0.25)';
  closeButton.style.color = '#e0e0e0';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '18px';
  closeButton.style.lineHeight = '1';
}

/**
 * Creates the shimmer sweep overlay element for the header.
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
  shimmer.style.background =
    'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)';
  return shimmer;
}
