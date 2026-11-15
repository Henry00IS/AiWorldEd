import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';

/**
 * Applies panel chrome styles for the progress dialog.
 *
 * @param panel Panel element.
 */
export function applyImportOverlayPanelStyles(panel: HTMLElement): void {
  panel.style.minWidth = '320px';
  panel.style.maxWidth = '420px';
  panel.style.padding = '20px 24px';
  panel.style.borderRadius = '8px';
  panel.style.background = ThemeCss.panelBackground;
  panel.style.border = `1px solid ${ThemeCss.separatorColor}`;
  panel.style.boxShadow = '0 8px 32px rgba(0, 0, 0, calc(0.45 * var(--aiworlded-shadow-strength, 1)))';
  panel.style.boxSizing = 'border-box';
  panel.style.fontFamily = 'system-ui, sans-serif';
}

/**
 * Applies title text styles.
 *
 * @param titleEl Title element.
 * @param title Heading text.
 */
export function applyImportOverlayTitleStyles(titleEl: HTMLElement, title: string): void {
  titleEl.textContent = title;
  titleEl.style.color = ThemeCss.textColor;
  titleEl.style.fontSize = '15px';
  titleEl.style.fontWeight = '600';
  titleEl.style.marginBottom = '8px';
}

/**
 * Applies status label styles.
 *
 * @param labelEl Label element.
 */
export function applyImportOverlayLabelStyles(labelEl: HTMLElement): void {
  labelEl.textContent = 'Starting…';
  labelEl.style.color = ThemeCss.mutedTextColor;
  labelEl.style.fontSize = '12px';
  labelEl.style.marginBottom = '14px';
  labelEl.style.minHeight = '1.2em';
}

/**
 * Builds the progress track and fill elements.
 *
 * @param barFill Fill element owned by the overlay.
 * @returns Track element containing the fill.
 */
export function buildImportOverlayTrack(barFill: HTMLElement): HTMLElement {
  const track = document.createElement('div');
  track.style.height = '10px';
  track.style.borderRadius = '5px';
  track.style.background = ThemeCss.separatorColor;
  track.style.overflow = 'hidden';
  barFill.style.height = '100%';
  barFill.style.width = '0%';
  barFill.style.borderRadius = '5px';
  barFill.style.background = ThemeCss.accentColor;
  barFill.style.transition = 'width 0.08s linear';
  track.appendChild(barFill);
  return track;
}

/**
 * Applies percent text styles.
 *
 * @param percentEl Percent label element.
 */
export function applyImportOverlayPercentStyles(percentEl: HTMLElement): void {
  percentEl.textContent = '0%';
  percentEl.style.color = ThemeCss.mutedTextColor;
  percentEl.style.fontSize = '11px';
  percentEl.style.marginTop = '8px';
  percentEl.style.textAlign = 'right';
}
