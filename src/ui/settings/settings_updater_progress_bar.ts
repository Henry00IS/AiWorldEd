import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** Slim progress bar for the update download in the Update settings tab. */
export class SettingsUpdaterProgressBar {
  private readonly track: HTMLElement;
  private readonly fill: HTMLElement;

  /** Creates the bar at zero percent. */
  constructor() {
    const palette = getActiveUiThemePalette();
    this.track = document.createElement('div');
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-label', 'Update Download');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.track.style.cssText = 'width:100%;max-width:320px;height:4px;border-radius:2px;overflow:hidden;';
    this.track.style.background = palette.controlBackground;
    this.track.style.border = `1px solid ${palette.controlBorderColor}`;
    this.fill = document.createElement('div');
    this.fill.style.cssText = 'height:100%;width:0;transition:width 120ms linear;';
    this.fill.style.background = palette.rangeAccentColor;
    this.track.appendChild(this.fill);
  }

  /**
   * Returns the bar element.
   *
   * @returns Track element holding the fill.
   */
  getElement(): HTMLElement {
    return this.track;
  }

  /**
   * Shows a percentage, clamped to 0..100.
   *
   * @param percent Progress in percent.
   */
  percentSet(percent: number): void {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    this.fill.style.width = `${clampedPercent}%`;
    this.track.setAttribute('aria-valuenow', String(clampedPercent));
  }
}
