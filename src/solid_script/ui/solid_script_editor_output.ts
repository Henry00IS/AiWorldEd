import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentSource } from '@/solid_script/document/solid_script_document_source.js';
import { solidScriptErrorLine, solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/**
 * The output strip under the script: the first error with its line, or the
 * solid count and the Echo messages of the last run.
 */
export class SolidScriptEditorOutput {
  /** Output element. */
  readonly element = document.createElement('div');
  private failed: number | null = null;

  /** Creates the strip. */
  constructor() {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.output;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  /**
   * Runs a script and shows what it reports.
   *
   * @param document Script.
   */
  show(document: SolidScriptDocument): void {
    try {
      const result = solidScriptProgramEvaluate(solidScriptDocumentSource(document));
      const count = result.steps.length;
      this.failed = null;
      this.text([`${count} ${count === 1 ? 'solid' : 'solids'}`, ...result.messages].join('\n'), false);
    } catch (error) {
      const message = solidScriptErrorText(error);
      const line = solidScriptErrorLine(message);
      this.failed = line === null ? null : line - 1;
      this.text(message, true);
    }
  }

  /**
   * Returns the line of the error shown.
   *
   * @returns 0-based line, or null without an error.
   */
  failedLine(): number | null {
    return this.failed;
  }

  /**
   * Writes the strip.
   *
   * @param text Text.
   * @param error True for an error.
   */
  private text(text: string, error: boolean): void {
    this.element.textContent = text;
    this.element.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.outputError, error);
  }
}
