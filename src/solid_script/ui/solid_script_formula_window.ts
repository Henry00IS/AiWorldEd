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
import type { SolidScriptFieldTokenStart } from '@/solid_script/language/solid_script_field_tokens.js';
import {
  solidScriptFormulaBodyOr,
  solidScriptFormulaStore,
} from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptFormulaProblem } from '@/solid_script/language/solid_script_formula_bare.js';
import type { SolidScriptInput } from '@/solid_script/language/solid_script_input.js';
import { SolidScriptDialog } from './solid_script_dialog.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptEditorFavorites } from './solid_script_editor_favorites.js';
import { SolidScriptEditorLineConfigure } from './solid_script_editor_line_configure.js';
import { SolidScriptEditorLines } from './solid_script_editor_lines.js';
import { SolidScriptEditorPalette } from './solid_script_editor_palette.js';
import { SolidScriptEditorHelp } from './solid_script_editor_help.js';
import { SolidScriptEditorTip, solidScriptEditorCodeHighlight } from './solid_script_editor_tip.js';
import { SolidScriptEditorFrame } from './solid_script_editor_frame.js';
import {
  SOLID_SCRIPT_FORMULA_BOUNDS_KEY,
  SOLID_SCRIPT_FORMULA_SIZES_KEY,
  solidScriptEditorSizesRead,
  solidScriptEditorSplitter,
} from './solid_script_editor_splitters.js';

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
  'Drag blocks in from the left; the formula on the bottom right follows. Double-click a block to change it.';

/** What the help beside the blocks says about using the formula window. */
const SOLID_SCRIPT_FORMULA_WINDOW_HELP = {
  empty:
    'Select a block, in the list or among the formula blocks, to read what it does and what each of its values means.',
  palette:
    'Drag it into the formula, or double-click it to add it at the current block. Blocks that hold others, such as Equals, take the blocks between them and their End.',
  line: 'Double-click a block or press Enter to change it. Drag blocks to move them, into a group to put them inside it. Delete removes the selected blocks; Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste them.',
};

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
 * the middle, and on the right the help of the selected block above the formula
 * as highlighted text that can be copied. It opens over the window of a field
 * and writes the field only on OK; Cancel leaves it as it was.
 */
export class SolidScriptFormulaWindow extends SolidScriptDialog {
  private readonly catalog: SolidScriptCommandCatalog;
  private readonly lines: SolidScriptEditorLines;
  private readonly palette: SolidScriptEditorPalette;
  private readonly lineConfigure: SolidScriptEditorLineConfigure;
  private readonly help = new SolidScriptEditorHelp(null, SOLID_SCRIPT_FORMULA_WINDOW_HELP);
  private readonly preview = document.createElement('div');
  private readonly frame: SolidScriptEditorFrame;
  private readonly tip: SolidScriptEditorTip;
  private parts: ReadonlyMap<number, string> = new Map();
  private readonly status = document.createElement('div');
  private readonly blocks: SolidScriptFormulaBlocks;
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
    super(options.host, `${options.label} Formula`, 'OK', options.parent, true);
    this.root.dataset['solidScriptFormula'] = options.label;
    this.frame = this.frameCreate();
    this.catalog = solidScriptFormulaCatalog(options.context);
    this.body = solidScriptFormulaBodyOr(options.kind, options.stored) ?? '';
    this.blocks = solidScriptFormulaRead(this.body, options.context);
    this.document = this.blocks.document;
    this.lineConfigure = this.lineConfigureCreate();
    this.lines = this.linesCreate();
    this.tip = new SolidScriptEditorTip(this.lines.host, (line) => this.partText(line), this.fieldStart());
    this.palette = this.paletteCreate();
    this.layout();
    this.commit(this.document, null);
    if (solidScriptFormulaBodyOr(options.kind, options.stored) === null) this.statusShow(this.plainNote());
  }

  /**
   * Notes that the field held plain text, which OK replaces.
   *
   * @returns Note.
   */
  private plainNote(): string {
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
        select: (line) => this.helpShow(line),
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
      (command: SolidScriptCommand) => this.help.show(command, null),
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

  /**
   * Sizes the window like the script editor and places it where it was last
   * left, remembered apart from the script editor.
   *
   * @returns Frame.
   */
  private frameCreate(): SolidScriptEditorFrame {
    Object.assign(this.root.style, { display: 'flex', flexDirection: 'column' });
    Object.assign(this.content.style, { flex: '1 1 0', minHeight: '0', display: 'flex', flexDirection: 'column' });
    const place = (left: number, top: number): void => this.setTopLeftPosition(left, top);
    const window = { root: this.root, place, clamp: () => this.clampToScreen() };
    return new SolidScriptEditorFrame(window, SOLID_SCRIPT_FORMULA_BOUNDS_KEY);
  }

  /**
   * Puts the palette, the blocks, the help, the formula and the buttons in the
   * window.
   */
  private layout(): void {
    const body = document.createElement('div');
    body.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaBody;
    const side = document.createElement('div');
    side.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaSide;
    this.help.host.style.flex = '1 1 0';
    side.append(this.help.host, this.previewCreate());
    const sizes = solidScriptEditorSizesRead(undefined, SOLID_SCRIPT_FORMULA_SIZES_KEY);
    body.append(
      this.palette.element,
      solidScriptEditorSplitter(this.palette.element, 'palette', sizes, SOLID_SCRIPT_FORMULA_SIZES_KEY),
      this.lines.host,
      solidScriptEditorSplitter(side, 'help', sizes, SOLID_SCRIPT_FORMULA_SIZES_KEY),
      side,
    );
    this.status.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaStatus;
    this.status.setAttribute('role', 'status');
    this.content.append(body, this.status, this.buttonRow());
    this.root.append(this.frame.grip());
  }

  /** Places the window where it was last left, at its remembered size. */
  protected override onAfterShow(): void {
    this.frame.restore();
  }

  /** Remembers where the window was moved. */
  protected override onAfterMove(): void {
    this.frame.remember();
  }

  /**
   * Creates the formula as text: read only, highlighted like a field, and
   * selectable so it can be copied; Ctrl+A selects only the formula.
   *
   * @returns Preview element.
   */
  private previewCreate(): HTMLElement {
    this.preview.className = SOLID_SCRIPT_EDITOR_CLASSES.formulaText;
    this.preview.tabIndex = 0;
    this.preview.setAttribute('role', 'textbox');
    this.preview.setAttribute('aria-readonly', 'true');
    this.preview.setAttribute('aria-label', `${this.options.label} formula`);
    this.preview.title = 'What OK writes into the field. Select it to copy it.';
    this.preview.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() !== 'a' || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.preview.ownerDocument.getSelection()?.selectAllChildren(this.preview);
    });
    this.previewShow(this.fieldText(this.body));
    return this.preview;
  }

  /**
   * Shows field text in the preview, highlighted as the field shows it.
   *
   * @param text Field text.
   */
  private previewShow(text: string): void {
    this.preview.replaceChildren(...solidScriptEditorCodeHighlight(text, this.fieldStart()));
  }

  /**
   * Returns the text OK writes into the field for a formula; the preview, the
   * tips of the blocks and OK all show it, so they never differ.
   *
   * @param formula Formula of the blocks, or of one block.
   * @returns Field text.
   */
  private fieldText(formula: string): string {
    return solidScriptFormulaStore(this.options.kind, formula, this.options.stored);
  }

  /**
   * Returns the field text of the block on a line, for its tip.
   *
   * @param line Line index.
   * @returns Field text, or null for a line with no formula.
   */
  private partText(line: number): string | null {
    const part = this.parts.get(line);
    return part === undefined ? null : this.fieldText(part);
  }

  /**
   * Tells how the field reads its text outside brackets: a condition is a
   * formula as a whole, any other field is text with [names] and [=formulas].
   *
   * @returns Start.
   */
  private fieldStart(): SolidScriptFieldTokenStart {
    return this.options.kind === 'condition' ? 'formula' : 'text';
  }

  /**
   * Shows the help of the block on a line, or the hint when it has none.
   *
   * @param line Line index.
   */
  private helpShow(line: number): void {
    const block = this.document.blocks[line];
    const command = block ? this.catalog.find(block.command) : undefined;
    if (block && command) this.help.show(command, block);
    else this.help.clear();
  }

  /**
   * Takes blocks changed in the list as they are and writes them as the formula
   * text, or shows what keeps them from being one. The blocks stay the ones
   * edited: the text is read into blocks only when the window opens, so a group
   * keeps its place while it holds no block or one.
   *
   * @param document Blocks.
   * @param line Line to focus.
   */
  private commit(document: SolidScriptDocument, line: number | null): void {
    this.document = document;
    this.lines.render(document, line);
    const written = solidScriptFormulaWrite(document, this.blocks, this.options.context);
    this.blocksBroken = 'problem' in written;
    this.parts = 'problem' in written ? new Map() : written.parts;
    if ('problem' in written) return this.problemSet(`Line ${written.line + 1}: ${written.problem}`);
    this.body = written.text;
    this.previewShow(this.fieldText(written.text));
    this.problemSet('');
  }

  /**
   * Shows a problem, or clears it; while the blocks make no formula the text
   * keeps the last one they made, greyed.
   *
   * @param problem Problem in plain words, or an empty string.
   */
  private problemSet(problem: string): void {
    this.problemText = problem;
    this.preview.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.formulaOff, this.blocksBroken);
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
    this.options.apply(this.fieldText(this.body));
    return true;
  }

  /** Leaves the field as it was. */
  protected cancel(): void {
    return undefined;
  }

  /**
   * Keeps Enter for the blocks, where it opens the current one.
   *
   * @param target Element the key was pressed on.
   * @returns True when Enter presses OK.
   */
  protected override enterConfirms(target: EventTarget | null): boolean {
    if (target instanceof Node && this.lines.host.contains(target)) return false;
    return super.enterConfirms(target);
  }

  /** Takes the lists off the page with the window. */
  protected override onAfterHide(): void {
    super.onAfterHide();
    this.lines.dispose();
    this.palette.dispose();
    this.tip.dispose();
  }

  /** Gives the block list the keyboard focus, on its current block. */
  protected override focusIn(): void {
    this.lines.focusIn();
  }

  /** Hides the code tip under a dialog opened over the window. */
  protected override popupsClose(): void {
    this.tip.hide();
  }
}
