import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';

/**
 * A small number field opened at a slider handle, so an exact value can be
 * typed. Enter writes a number, Escape or leaving the field closes it.
 */
export class GeneratorSliderEntry {
  /** Open field, or null. */
  private field: HTMLInputElement | null = null;

  /**
   * Opens the field at a client point, replacing an open one.
   *
   * @param doc Document of the pane.
   * @param x Client X.
   * @param y Client Y.
   * @param label Caption the field is named by.
   * @param text Current value.
   * @param commit Receives a typed number on Enter.
   */
  open(doc: Document, x: number, y: number, label: string, text: string, commit: (value: number) => void): void {
    this.close();
    const field = doc.createElement('input');
    field.type = 'text';
    field.inputMode = 'decimal';
    field.setAttribute('aria-label', label);
    field.value = text;
    Object.assign(field.style, GENERATOR_SLIDER_ENTRY_STYLE, { left: `${x}px`, top: `${y}px` });
    field.addEventListener('keydown', (event) => this.key(event, commit));
    field.addEventListener('blur', () => this.close());
    doc.body.append(field);
    this.field = field;
    field.focus();
    field.select();
  }

  /** Closes the field without writing. */
  close(): void {
    const field = this.field;
    this.field = null;
    field?.remove();
  }

  /**
   * Writes the typed number on Enter and closes on Escape; text that is not a
   * number keeps the field open.
   *
   * @param event Key event of the field.
   * @param commit Receives the typed number.
   */
  private key(event: KeyboardEvent, commit: (value: number) => void): void {
    if (event.key === 'Escape') this.close();
    if (event.key !== 'Enter' || !this.field) return;
    const value = Number(this.field.value.trim().replace(',', '.'));
    if (this.field.value.trim() === '' || !Number.isFinite(value)) {
      this.field.setAttribute('aria-invalid', 'true');
      return;
    }
    this.close();
    commit(value);
  }
}

/** Inline style of the typing field. */
const GENERATOR_SLIDER_ENTRY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  transform: 'translate(-7px, -50%)',
  zIndex: '6',
  width: '64px',
  font: '12px sans-serif',
  color: ThemeCss.inputTextColor,
  background: ThemeCss.inputBackground,
  border: `1px solid ${ThemeCss.inputBorderColor}`,
};
