import { Theme } from '@/theme.js';
import { inputNumericFormatWithMinimumDecimals } from '@/ui/input/input_numeric_parse.js';

/**
 * Bottom status bar displaying editor state information. Shows undo/redo counts
 * on the left and mode/snap info on the right.
 */
export class StatusBar {
  private container: HTMLElement;
  private leftPanel: HTMLElement;
  private rightPanel: HTMLElement;
  private undoRedoText!: HTMLElement;
  private lastActionText!: HTMLElement;
  private modeText!: HTMLElement;
  private snapText!: HTMLElement;
  private snapIntervalFormatted: string;
  private savedInfoText!: HTMLElement;
  private fitFeedbackText!: HTMLElement;
  private shadingModeText!: HTMLElement;
  private selectionModeText!: HTMLElement;
  private isDisposed: boolean;

  /**
   * Creates a new status bar and appends it to the given container.
   *
   * @param container The parent DOM element to append the status bar into.
   * @param theme The theme containing color definitions.
   */
  constructor(container: HTMLElement, theme: typeof Theme) {
    this.container = document.createElement('div');
    this.leftPanel = document.createElement('div');
    this.rightPanel = document.createElement('div');
    this.createTextElements();
    this.snapIntervalFormatted = this.formatSnapInterval(0.25);
    this.isDisposed = false;
    this.applyContainerStyles(theme);
    this.applyPanelStyles(this.leftPanel);
    this.applyPanelStyles(this.rightPanel);
    this.styleAllTextElements();
    this.assembleDomHierarchy(container);
    this.applyInitialTextContent();
  }

  /** Creates all status label span elements. */
  private createTextElements(): void {
    this.undoRedoText = document.createElement('span');
    this.lastActionText = document.createElement('span');
    this.modeText = document.createElement('span');
    this.snapText = document.createElement('span');
    this.savedInfoText = document.createElement('span');
    this.fitFeedbackText = document.createElement('span');
    this.shadingModeText = document.createElement('span');
    this.selectionModeText = document.createElement('span');
  }

  /** Applies shared text styles to every status label. */
  private styleAllTextElements(): void {
    this.applyTextStyle(this.undoRedoText);
    this.applyTextStyle(this.lastActionText);
    this.applyTextStyle(this.modeText);
    this.applyTextStyle(this.snapText);
    this.applyTextStyle(this.savedInfoText);
    this.applyTextStyle(this.fitFeedbackText);
    this.applyTextStyle(this.shadingModeText);
    this.applyTextStyle(this.selectionModeText);
  }

  /**
   * Mounts left/right panels into the status bar and attaches to the host.
   *
   * @param host Parent DOM element for the status bar.
   */
  private assembleDomHierarchy(host: HTMLElement): void {
    this.leftPanel.appendChild(this.undoRedoText);
    this.leftPanel.appendChild(this.lastActionText);
    this.leftPanel.appendChild(this.savedInfoText);
    this.leftPanel.appendChild(this.fitFeedbackText);
    this.leftPanel.appendChild(this.selectionModeText);
    this.rightPanel.appendChild(this.modeText);
    this.rightPanel.appendChild(this.snapText);
    this.rightPanel.appendChild(this.shadingModeText);
    this.container.appendChild(this.leftPanel);
    this.container.appendChild(this.rightPanel);
    host.appendChild(this.container);
  }

  /** Writes default status label strings for a fresh editor session. */
  private applyInitialTextContent(): void {
    this.undoRedoText.textContent = 'Undo: 0 | Redo: 0';
    this.lastActionText.textContent = '';
    this.modeText.textContent = 'Mode: Bounds';
    this.snapText.textContent = ` | Snap: On (${this.snapIntervalFormatted})`;
    this.savedInfoText.textContent = '';
    this.fitFeedbackText.textContent = '';
    this.shadingModeText.textContent = ' | Shading: Solid';
    this.selectionModeText.textContent = ' | Selection: Object';
  }

  /**
   * Updates the current shading mode display.
   *
   * @param mode The shading mode name to show in the status bar.
   */
  setShadingMode(mode: string): void {
    if (this.isDisposed) return;
    this.shadingModeText.textContent = ` | Shading: ${mode}`;
  }

  /**
   * Updates the undo and redo counter display.
   *
   * @param undoCount The number of available undo operations.
   * @param redoCount The number of available redo operations.
   */
  setUndoRedoCounts(undoCount: number, redoCount: number): void {
    if (this.isDisposed) return;
    this.undoRedoText.textContent = `Undo: ${undoCount} | Redo: ${redoCount}`;
  }

  /**
   * Updates the current transform mode display.
   *
   * @param mode The current transform mode name.
   */
  setTransformMode(mode: string): void {
    if (this.isDisposed) return;
    this.modeText.textContent = `Mode: ${mode}`;
  }

  /**
   * Updates the snap status display with enabled state and current interval.
   *
   * @param enabled Whether grid snapping is currently enabled.
   */
  setSnapStatus(enabled: boolean): void {
    if (this.isDisposed) return;
    if (enabled) {
      this.snapText.textContent = ` | Snap: On (${this.snapIntervalFormatted})`;
    } else {
      this.snapText.textContent = ' | Snap: Off';
    }
  }

  /**
   * Updates the snap interval display in the status bar.
   *
   * @param interval The current snap interval value.
   */
  setSnapInterval(interval: number): void {
    if (this.isDisposed) return;
    this.snapIntervalFormatted = this.formatSnapInterval(interval);
    this.snapText.textContent = ` | Snap: On (${this.snapIntervalFormatted})`;
  }

  /**
   * Formats a snap interval number for display. Keeps at least one fractional
   * digit and allows up to five places for fine steps such as 0.03125.
   *
   * @param value The interval value to format.
   * @returns A formatted string representation of the interval.
   */
  private formatSnapInterval(value: number): string {
    return inputNumericFormatWithMinimumDecimals(value, 1);
  }

  /**
   * Updates the last action feedback message.
   *
   * @param message The action message to display, or empty string to clear.
   */
  setLastAction(message: string): void {
    if (this.isDisposed) return;
    this.lastActionText.textContent = message;
  }

  /**
   * Updates the last saved file information display.
   *
   * @param filename The filename to show as last saved.
   */
  setLastSavedInfo(filename: string): void {
    if (this.isDisposed) return;
    this.savedInfoText.textContent = ` | Saved: ${filename}`;
  }

  /**
   * Updates the status bar with an error message.
   *
   * @param message The error message to display.
   */
  setErrorText(message: string): void {
    if (this.isDisposed) return;
    this.lastActionText.textContent = message;
    this.lastActionText.style.color = '#ff4444';
    this.clearErrorColor();
  }

  /** Schedules clearing the error color after a short delay. */
  private clearErrorColor(): void {
    setTimeout(() => {
      if (!this.isDisposed) {
        this.lastActionText.style.color = Theme.statusBarTextColor;
      }
    }, 3000);
  }

  /**
   * Updates the fit-to-selection feedback message in the status bar.
   *
   * @param message The fit feedback message, or empty string to clear.
   */
  setFitFeedback(message: string): void {
    if (this.isDisposed) return;
    this.fitFeedbackText.textContent = message;
  }

  /**
   * Updates the selection mode and face count display in the status bar.
   *
   * @param mode The selection mode label (e.g. "Object" or "Face").
   * @param count The number of selected faces when in face mode.
   */
  setSelectionModeInfo(mode: string, count: number): void {
    if (this.isDisposed) return;
    if (mode === 'Face') {
      this.selectionModeText.textContent = ` | Selection: Face (${count} face(s))`;
    } else {
      this.selectionModeText.textContent = ' | Selection: Object';
    }
  }

  /**
   * Returns the root DOM element of the status bar.
   *
   * @returns The container element.
   */
  getRootElement(): HTMLElement {
    return this.container;
  }

  /** Disposes the status bar and removes it from the DOM. */
  dispose(): void {
    this.isDisposed = true;
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  /**
   * Applies the outer container styles for the status bar.
   *
   * @param theme The theme containing color definitions.
   */
  private applyContainerStyles(theme: typeof Theme): void {
    this.container.classList.add('editor-status-bar');
    this.container.style.display = 'flex';
    this.container.style.justifyContent = 'space-between';
    this.container.style.alignItems = 'center';
    this.container.style.padding = '4px 12px';
    this.container.style.background = theme.statusBarBackground;
    this.container.style.borderTop = `1px solid ${theme.statusBarBorderColor}`;
    this.container.style.minHeight = '24px';
    this.container.style.userSelect = 'none';
  }

  /**
   * Applies flex styles to panel elements.
   *
   * @param panel The panel element to style.
   */
  private applyPanelStyles(panel: HTMLElement): void {
    panel.style.display = 'flex';
    panel.style.alignItems = 'center';
    panel.style.gap = '8px';
  }

  /**
   * Applies text styling to status bar text elements.
   *
   * @param element The text element to style.
   */
  private applyTextStyle(element: HTMLElement): void {
    element.style.fontSize = '11px';
    element.style.fontFamily = 'monospace';
    element.style.color = Theme.statusBarTextColor;
    element.style.whiteSpace = 'nowrap';
  }
}
