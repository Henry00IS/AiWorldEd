import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptFormulaCatalog } from '@/solid_script/commands/solid_script_formula_commands.js';
import type { SolidScriptFormulaContext } from '@/solid_script/commands/solid_script_formula_inputs.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptFormulaRead,
  type SolidScriptFormulaBlocks,
} from '@/solid_script/document/solid_script_formula_read.js';
import { solidScriptFormulaWrite } from '@/solid_script/document/solid_script_formula_write.js';
import type { SolidScriptFieldKind } from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptFormulaBodyOr,
  solidScriptFormulaStore,
} from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptFormulaProblem } from '@/solid_script/language/solid_script_formula_source.js';
import type { SolidScriptInput } from '@/solid_script/language/solid_script_input.js';
import { SolidScriptDialog } from './solid_script_dialog.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptEditorFavorites } from './solid_script_editor_favorites.js';
import { SolidScriptEditorLineConfigure } from './solid_script_editor_line_configure.js';
import { SolidScriptEditorLines } from './solid_script_editor_lines.js';
import { SolidScriptEditorPalette } from './solid_script_editor_palette.js';

/** What the formula window edits and where its text goes. */
export interface SolidScriptFormulaWindowOptions {
  /** Element the window mounts in. */
  host: HTMLElement;
  /** Window it opens over, which it darkens, or null. */
  parent: SolidScriptDialog | null;
  /** Caption of the field, such as Where. */
  label: string;
  /** How the field reads its text. */
  kind: SolidScriptFieldKind;
  /** Field text. */
  stored: string;
  /** Where the formula is used, such as per Face. */
  context: SolidScriptFormulaContext;
  /** Names the script defines, offered while typing. */
  names: readonly SolidScriptName[];
  /** Names the field fills in, such as $Face. */
  fills: readonly string[];
  /** Input lines of the script, for Choice inputs. */
  inputs: readonly SolidScriptInput[];
  /** Writes the built text into the field, on OK. */
  apply: (stored: string) => void;
}

/** Note shown while nothing is wrong. */
const SOLID_SCRIPT_FORMULA_WINDOW_HINT =
  'Drag blocks in from the left, or type on the right; both stay the same formula. Double-click a block to change it.';

/**
 * Tells why a field cannot open in the formula window: its formula has a
 * mistake. Plain text, such as 1, 2, 3, opens empty instead.
 *
 * @param kind How the field reads its text.
 * @param stored Field text.
 * @returns Problem in plain words, or an empty string.
 */
export function solidScriptFormulaWindowProblem(kind: SolidScriptFieldKind, stored: string): string {
  const body = solidScriptFormulaBodyOr(kind, stored) ?? '';
  const problem = body.trim() === '' ? '' : solidScriptFormulaProblem(body);
  return problem ? `Fix the formula first: ${problem}.` : '';
}

/**
 * The formula window: blocks on the left to pick from, the formula as blocks in
 * the middle, the same formula as text on the right. It opens over the window
 * of a field and writes the field only on OK; Cancel leaves it as it was.
 */
export class SolidScriptFormulaWindow extends SolidScriptDialog {
  private readonly catalog: SolidScriptCommandCatalog;
  private readonly lines: SolidScriptEditorLines;
  private readonly palette: SolidScriptEditorPalette;
  private readonly lineConfigure: SolidScriptEditorLineConfigure;
  private readonly text = document.createElement('textarea');
  private readonly status = document.createElement('div');
  private blocks: SolidScriptFormulaBlocks;
  private document: SolidScriptDocument;
  private body: string;
  private problemText = '';
  private blocksBroken = false;

  /**
   * Builds the window.
   *
   * @param options What it edits and where its text goes.
   */
  constructor(private readonly options: SolidScriptFormulaWindowOptions) {
    super(options.host, `${options.label} Formula`, 'OK', options.parent);
    this.root.dataset['solidScriptFormula'] = options.label;
    this.root.style.width = 'min(1100px, calc(100vw - 48px))';
    this.root.style.maxWidth = 'none';
    this.catalog = solidScriptFormulaCatalog(options.context);
    this.body = solidScriptFormulaBodyOr(options.kind, options.stored) ?? '';
    this.blocks = solidScriptFormulaRead(this.body, options.context);
    this.document = this.blocks.document;
    this.lineConfigure = this.lineConfigureCreate();
    this.lines = this.linesCreate();
    this.palette = this.paletteCreate();
    this.layout();
    this.lines.render(this.document, null);
    this.statusShow(this.plainNote());
  }

  /**
   * Notes that the field held plain text, which OK replaces.
   *
   * @returns Note, or the usual hint.
   */
  private plainNote(): string {
    if (solidScriptFormulaBodyOr(this.options.kind, this.options.stored) !== null)
      return SOLID_SCRIPT_FORMULA_WINDOW_HINT;
    return `${this.options.label} holds plain text, not a formula. OK replaces it with the formula built here.`;
  }

  /**
   * Creates what inserts and configures blocks, with the configurator windows
   * opening over this one.
   *
   * @returns Line configuring.
   */
  private lineConfigureCreate(): SolidScriptEditorLineConfigure {
    return new SolidScriptEditorLineConfigure({
      catalog: this.catalog,
      document: () => this.document,
      commit: (document, line) => this.commit(document, line),
      notice: (text) => this.statusShow(text),
      names: () => this.options.names,
      inputs: () => this.options.inputs,
      fills: () => this.options.fills,
      history: null,
      mount: () => this.options.host,
      parent: () => this,
    });
  }

  /**
   * Creates the block list, the same list the script editor shows.
   *
   * @returns Lines.
   */
  private linesCreate(): SolidScriptEditorLines {
    return new SolidScriptEditorLines(
      {
        edit: (document, line) => this.commit(document, line),
        configure: (line) => this.lineConfigure.configure(line),
        insert: (command, drop) => this.lineConfigure.insert(command, drop.line, 'before'),
        select: () => undefined,
        notice: (text) => this.statusShow(text),
        breakpoint: () => undefined,
      },
      { catalog: this.catalog, label: 'Formula blocks', switches: false },
    );
  }

  /**
   * Creates the palette of blocks with its search and favorites, the same
   * palette the script editor shows.
   *
   * @returns Palette.
   */
  private paletteCreate(): SolidScriptEditorPalette {
    return new SolidScriptEditorPalette(
      (command) => this.lineConfigure.insert(command, this.lines.caret(), 'caret', {}, this.lines.selectedRun()),
      (command: SolidScriptCommand) => this.statusShow(command.manual),
      new SolidScriptEditorFavorites(undefined, this.catalog),
      {
        catalog: this.catalog,
        noun: 'Blocks',
        singular: 'block',
        searchHint: 'Type part of a name or what it does, such as "box" or "tag". Enter inserts the highlighted block.',
        target: 'the formula',
      },
    );
  }

  /** Puts the palette, the blocks, the text and the buttons in the window. */
  private layout(): void {
    const body = document.createElement('div');
    body.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaBody;
    this.text.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaText;
    this.text.spellcheck = false;
    this.text.value = this.body;
    this.text.setAttribute('aria-label', `${this.options.label} formula`);
    this.text.title = 'The formula as text, such as InBox([$Face.Center], [0, 0, 0], 2) && [$NY] > 0.5.';
    this.text.addEventListener('input', () => this.typed());
    body.append(this.palette.element, this.lines.host, this.text);
    this.status.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaStatus;
    this.status.setAttribute('role', 'status');
    this.content.append(body, this.status, this.buttonRow());
  }

  /**
   * Takes blocks changed in the list and writes them as the formula text, or
   * shows what keeps them from being one. The text is then read again, so each
   * block shows as what it holds, such as a Number typed as 5, 2, 7 as a
   * Vector.
   *
   * @param document Blocks.
   * @param line Line to focus.
   */
  private commit(document: SolidScriptDocument, line: number): void {
    const written = solidScriptFormulaWrite(document, this.blocks, this.options.context);
    this.blocksBroken = 'problem' in written;
    if ('problem' in written) {
      this.document = document;
      this.lines.render(document, line);
      return this.problemSet(`Line ${written.line + 1}: ${written.problem}`);
    }
    if (this.text.value !== written.text) this.text.value = written.text;
    this.read(written.text, line);
  }

  /** Reads typed text into blocks, or shows why it cannot be read. */
  private typed(): void {
    if (this.blocksBroken) return;
    try {
      this.read(this.text.value, null);
    } catch (error) {
      this.problemSet(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Shows formula text as blocks.
   *
   * @param text Formula.
   * @param line Line to focus, or null.
   * @throws Error naming the first problem when the text cannot be read.
   */
  private read(text: string, line: number | null): void {
    this.blocks = solidScriptFormulaRead(text, this.options.context);
    this.body = text;
    this.document = this.blocks.document;
    this.lines.render(this.document, line);
    this.problemSet('');
  }

  /**
   * Shows a problem, or clears it: while the text has one the blocks rest,
   * while the blocks have one the text rests.
   *
   * @param problem Problem in plain words, or an empty string.
   */
  private problemSet(problem: string): void {
    this.problemText = problem;
    this.lines.host.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.formulaOff, problem !== '' && !this.blocksBroken);
    this.text.readOnly = this.blocksBroken;
    this.statusShow(problem || SOLID_SCRIPT_FORMULA_WINDOW_HINT, problem !== '');
  }

  /**
   * Shows a line under the formula.
   *
   * @param text Text.
   * @param problem True for a problem, shown in red.
   */
  private statusShow(text: string, problem = false): void {
    this.status.textContent = text;
    this.status.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.formulaProblem, problem);
  }

  /**
   * Writes the formula into the field, unless it has a problem.
   *
   * @returns True to close.
   */
  protected confirm(): boolean {
    if (this.problemText) {
      this.statusShow(`Fix the formula first: ${this.problemText}`, true);
      return false;
    }
    this.options.apply(solidScriptFormulaStore(this.options.kind, this.body, this.options.stored));
    return true;
  }

  /** Leaves the field as it was. */
  protected cancel(): void {
    return undefined;
  }

  /**
   * Keeps Enter for new lines in the text and for the blocks.
   *
   * @param target Element the key was pressed on.
   * @returns True when Enter presses OK.
   */
  protected override enterConfirms(target: EventTarget | null): boolean {
    if (target instanceof Node && (target === this.text || this.lines.host.contains(target))) return false;
    return super.enterConfirms(target);
  }

  /** Takes the lists off the page with the window. */
  protected override onAfterHide(): void {
    this.lines.dispose();
    this.palette.dispose();
  }
}
