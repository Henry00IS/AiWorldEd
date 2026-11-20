import { solidScriptExamplesAsk } from './solid_script_examples_dialog.js';
import type * as THREE from 'three';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { styleFloatingPanelStatusBar } from '@/ui/floating_panel/panel_floating_status_bar.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import {
  SOLID_SCRIPT_COMMAND_CATALOG,
  solidScriptCommandFind,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_EDITOR_CONFIGURED_GONE,
  SolidScriptEditorLineConfigure,
} from './solid_script_editor_line_configure.js';
import {
  SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT,
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptDocument,
  type SolidScriptLine,
  type SolidScriptUses,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentCommandInsert,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptDocumentDepths } from '@/solid_script/document/solid_script_document_indent.js';
import { SOLID_SCRIPT_EDITOR_CLASSES, solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';
import { SolidScriptEditorSession } from './solid_script_editor_session.js';
import { SolidScriptEditorPalette } from './solid_script_editor_palette.js';
import { SolidScriptEditorLines } from './solid_script_editor_lines.js';
import { SolidScriptEditorDebugger } from './solid_script_editor_debugger.js';
import {
  solidScriptDebugBreakpointAllowed,
  solidScriptDebugBreakpointLines,
  solidScriptDebugBreakpoints,
  solidScriptDebugBreakpointSet,
} from '@/solid_script/debug/solid_script_debug_breakpoints.js';
import { SolidScriptEditorToolbar } from './solid_script_editor_toolbar.js';
import { SolidScriptEditorHelp } from './solid_script_editor_help.js';
import {
  solidScriptDocumentNames,
  solidScriptDocumentNamesAt,
} from '@/solid_script/document/solid_script_document_names.js';
import { SolidScriptEditorSettings } from './solid_script_editor_settings.js';
import {
  SOLID_SCRIPT_EDITOR_BOUNDS_KEY,
  solidScriptEditorSizesRead,
  solidScriptEditorSplitter,
} from './solid_script_editor_splitters.js';
import {
  SOLID_SCRIPT_EDITOR_MIN_SIZE,
  SOLID_SCRIPT_EDITOR_SIZE,
  SolidScriptEditorFrame,
} from './solid_script_editor_frame.js';
import type { SolidScriptExplorerRun } from './solid_script_editor_explorer.js';
import { SolidScriptEditorOutput } from './solid_script_editor_output.js';
import { solidScriptEditorLoad, solidScriptEditorSave } from './solid_script_editor_files.js';
import { solidScriptEditorDebugSpeedMs, solidScriptEditorDebugSpeedRead } from './solid_script_editor_debug_speed.js';
import { solidScriptFileDropBind, type SolidScriptFileDropResult } from './solid_script_file_drop.js';
import {
  SOLID_SCRIPT_COMMAND_INPUT,
  SOLID_SCRIPT_INPUT_DEFAULTS,
  solidScriptInputsList,
} from '@/solid_script/language/solid_script_input.js';
import { SOLID_SCRIPT_SELECT_BETWEEN } from '@/solid_script/language/solid_script_select.js';

/** How often the editor looks for changes made elsewhere, in ms. */
const SOLID_SCRIPT_EDITOR_POLL_MS = 400;

/** How long a status message stays, in ms. */
const SOLID_SCRIPT_EDITOR_NOTICE_MS = 4000;

/** Status bar text while nothing else is shown. */
const SOLID_SCRIPT_EDITOR_HINT =
  'Double-click a command (or drag it in) to add it below the current line, then press Start. Double-click a line to change it. Ctrl+F searches, F9 sets a breakpoint.';

/**
 * The script editor window of a SolidScript generator: commands on the left,
 * the script of command lines in the middle, help for the selection on the
 * right, the debugger in the toolbar and output and variables below.
 */
export class SolidScriptEditor extends PanelFloating {
  private readonly session: SolidScriptEditorSession;
  private readonly lines: SolidScriptEditorLines;
  private readonly debugger: SolidScriptEditorDebugger;
  private palette: SolidScriptEditorPalette | null = null;
  private readonly toolbar: SolidScriptEditorToolbar;
  private readonly help = new SolidScriptEditorHelp((command) => this.commandReveal(command));
  private readonly output = new SolidScriptEditorOutput();
  private readonly status = document.createElement('div');
  private readonly title = document.createElement('span');
  /** Where the window was left and how big it was, between sessions. */
  private readonly frame = new SolidScriptEditorFrame(
    { root: this.root, place: (left, top) => this.setTopLeftPosition(left, top), clamp: () => this.clampToScreen() },
    SOLID_SCRIPT_EDITOR_BOUNDS_KEY,
  );
  private revision = '';
  /** Inserts lines and opens their configurator windows. */
  private readonly lineConfigure: SolidScriptEditorLineConfigure;
  private notice = '';
  private tracing = false;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly stackChanged = (): void => this.poll();

  /**
   * Builds the window.
   *
   * @param host Element the window mounts in.
   * @param target Generator, modifier and undo stack.
   * @param closed Runs once the window closed.
   */
  constructor(
    host: HTMLElement,
    private readonly target: ModifierStackActionTarget,
    private readonly closed: () => void,
  ) {
    super(host, { corner: 'top-left', insetBelowViewportToolbar: true });
    solidScriptEditorStylesheetEnsure();
    this.session = new SolidScriptEditorSession(
      target.volume,
      target.stepId,
      target.commandStack,
      target.refresh ?? null,
    );
    this.debugger = new SolidScriptEditorDebugger(this.session, () => this.debugChanged());
    this.debugger.stepMsSet(solidScriptEditorDebugSpeedMs(solidScriptEditorDebugSpeedRead()));
    this.lineConfigure = this.lineConfigureCreate();
    this.lines = new SolidScriptEditorLines({
      edit: (document, line) => this.commit(document, line),
      configure: (line) => this.lineConfigure.configure(line),
      insert: (command, drop) => this.lineConfigure.insert(command, drop.line, 'before'),
      select: (line) => this.selectLine(line),
      notice: (text) => this.noticeShow(text),
      breakpoint: (line) => this.breakpointToggle(line),
    });
    this.output.reveal = (line) => this.lines.focusLine(line);
    this.output.unknown = (unknown) => this.lines.unknownSet(unknown);
    this.output.settingsSet(
      new SolidScriptEditorSettings(
        this.session.use(),
        (document) => this.commit(document, null),
        (text) => this.noticeShow(text),
        (view) => this.lines.viewSet(view),
        (ms) => this.debugger.stepMsSet(ms),
      ),
    );
    this.output.selectAbove = (command, line) => this.selectAbove(command, line);
    this.output.inputAdd = () => this.inputAdd();
    this.toolbar = new SolidScriptEditorToolbar({
      start: () => this.debugger.start(),
      debug: () => this.debugger.play(),
      step: () => this.debugger.stepOnce(),
      stop: () => this.debugger.stop(),
      trace: (on) => this.traceSet(on),
      toggle: () => this.lines.linesToggle(),
      create: () => this.create(),
      examples: () => void this.examples(),
      save: () => void this.save(),
      load: () => void this.load(),
    });
    this.build();
  }

  /**
   * Creates how lines are added and changed through their window.
   *
   * @returns Line configuring.
   */
  private lineConfigureCreate(): SolidScriptEditorLineConfigure {
    return new SolidScriptEditorLineConfigure({
      catalog: SOLID_SCRIPT_COMMAND_CATALOG,
      document: () => this.session.document(),
      commit: (document, line) => this.commit(document, line),
      notice: (text) => this.noticeShow(text),
      names: (document, line) => solidScriptDocumentNamesAt(document, line),
      inputs: (document) => solidScriptInputsList(document.blocks),
      fills: () => [],
      history: (redo) => this.historyStep(redo),
      mount: () => this.root.ownerDocument.body,
      parent: () => null,
    });
  }

  /** Adds an Input line with a name no other variable has, below the last Input. */
  private inputAdd(): void {
    const blocks = this.session.document().blocks;
    const last = blocks.map((block) => block.command).lastIndexOf(SOLID_SCRIPT_COMMAND_INPUT);
    const used = new Set(solidScriptDocumentNames(this.session.document()).map((entry) => entry.name));
    let name = 'width';
    for (let index = 2; used.has(name); index++) name = `input${index}`;
    this.lineConfigure.insert(SOLID_SCRIPT_COMMAND_INPUT, Math.max(0, last), last >= 0 ? 'caret' : 'before', {
      ...(name === SOLID_SCRIPT_INPUT_DEFAULTS.name ? {} : { name }),
    });
  }

  /**
   * Returns whether the window edits a generator's script.
   *
   * @param node Generator node.
   * @param stepId Modifier id.
   * @returns True when it does.
   */
  matches(node: THREE.Object3D, stepId: string): boolean {
    return this.session.node === node && this.session.stepId === stepId;
  }

  /** Shows the window and starts following the script. */
  open(): void {
    this.show();
    this.revision = this.session.revision();
    this.render(0);
    this.pollTimer = setInterval(() => this.poll(), SOLID_SCRIPT_EDITOR_POLL_MS);
    this.target.commandStack?.onStackChanged(this.stackChanged);
  }

  /** Stops debugging and closes the window. */
  close(): void {
    this.debugger.stop();
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.target.commandStack?.offStackChanged(this.stackChanged);
    this.lines.dispose();
    this.palette?.dispose();
    this.dispose();
    this.closed();
  }

  /**
   * Places the window where it was last left, at its remembered size, or near
   * the top center of the screen the first time.
   */
  protected override onAfterShow(): void {
    this.frame.restore();
  }

  /** Remembers where the window was dragged. */
  protected override onAfterMove(): void {
    this.frame.remember();
  }

  /** Builds the window contents. */
  private build(): void {
    this.chrome();
    const bar = this.createStandardTitleBar({
      titleText: '',
      titleElement: this.title,
      flexShrinkZero: true,
      onClose: () => this.close(),
    });
    const palette = (this.palette = new SolidScriptEditorPalette(
      (command) => this.lineConfigure.insert(command, this.lines.caret(), 'caret', {}, this.lines.selectedRun()),
      (command) => this.help.show(command, null),
    ));
    const body = document.createElement('div');
    body.className = SOLID_SCRIPT_EDITOR_CLASSES.body;
    const sizes = solidScriptEditorSizesRead();
    body.append(
      palette.element,
      solidScriptEditorSplitter(palette.element, 'palette', sizes),
      this.lines.host,
      solidScriptEditorSplitter(this.help.host, 'help', sizes),
      this.help.host,
    );
    solidScriptFileDropBind(this.lines.element, ThemeCss.accentColor, (result) => this.dropped(result));
    styleFloatingPanelStatusBar(this.status);
    const outputSplitter = solidScriptEditorSplitter(this.output.element, 'output', sizes);
    this.root.append(
      bar.bar,
      this.toolbar.element,
      body,
      outputSplitter,
      this.output.element,
      this.status,
      this.grip(),
    );
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('mousedown', (event) => event.stopPropagation());
  }

  /** Styles the window frame at its default and smallest size. */
  private chrome(): void {
    this.root.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.root);
    this.root.dataset['solidScriptEditor'] = 'true';
    applyFloatingPanelToolChrome(this.root, {
      width: `${SOLID_SCRIPT_EDITOR_SIZE.width}px`,
      height: `${SOLID_SCRIPT_EDITOR_SIZE.height}px`,
      minWidth: `${SOLID_SCRIPT_EDITOR_MIN_SIZE.width}px`,
      minHeight: `${SOLID_SCRIPT_EDITOR_MIN_SIZE.height}px`,
      overflowHidden: true,
      borderBox: true,
    });
  }

  /**
   * Builds the resize grip.
   *
   * @returns Grip.
   */
  private grip(): HTMLElement {
    return this.frame.grip();
  }

  /**
   * Handles the run keys (Ctrl+F5 starts, F5 debugs or continues, F10 steps,
   * Ctrl+F10 runs to the line at the cursor, Shift+F5 stops, F9 sets or clears
   * the breakpoint of the current line) and keeps every other key inside the
   * editor, so Delete or Backspace never removes anything from the level. Undo
   * and redo step through the script's own history, never the level's.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    event.stopPropagation();
    const key = event.key.toLowerCase();
    if (!typing && (event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      event.preventDefault();
      return this.historyStep(key === 'y' || event.shiftKey);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.palette?.search.focus();
      this.palette?.search.select();
      return;
    }
    const action =
      event.key === 'F5'
        ? event.shiftKey
          ? () => this.debugger.stop()
          : event.ctrlKey || event.metaKey
            ? () => this.debugger.start()
            : () => this.debugger.play()
        : event.key === 'F10'
          ? event.ctrlKey || event.metaKey
            ? () => this.runToLine(this.keyLine(event))
            : () => this.debugger.stepOnce()
          : event.key === 'F9'
            ? () => this.breakpointToggle(this.keyLine(event))
            : null;
    if (!action) return;
    event.preventDefault();
    action();
  }

  /**
   * Undoes or redoes one script edit of this user, then shows the script.
   *
   * @param redo True for redo.
   */
  private historyStep(redo: boolean): void {
    if (!this.session.exists()) return this.close();
    this.debugger.stop();
    if (!(redo ? this.session.redo() : this.session.undo())) return;
    this.revision = this.session.revision();
    this.render(null);
  }

  /**
   * Builds up to the next solid of a line or of the lines inside its block.
   *
   * @param line Line index.
   */
  private runToLine(line: number): void {
    const depths = solidScriptDocumentDepths(this.session.document());
    let last = line;
    while (last + 1 < depths.length && (depths[last + 1] ?? 0) > (depths[line] ?? 0)) last++;
    if (!this.debugger.runTo(line, last))
      this.noticeShow(`Line ${line + 1} builds no solid, so the debugger cannot stop there.`);
  }

  /**
   * Returns the line a key was pressed on: the row holding the focus, or else
   * the caret line.
   *
   * @param event Key event.
   * @returns Line index.
   */
  private keyLine(event: KeyboardEvent): number {
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-line]') : null;
    const line = row ? Number(row.dataset['line']) : Number.NaN;
    return Number.isInteger(line) ? line : this.lines.caret();
  }

  /**
   * Stores an edited script, then shows it.
   *
   * @param document Script.
   * @param line Line to focus afterwards, or null to keep the focus.
   */
  private commit(document: SolidScriptDocument, line: number | null): void {
    if (!this.session.exists()) return this.close();
    this.debugger.stop();
    this.session.commit(document);
    this.revision = this.session.revision();
    this.render(line);
  }

  /**
   * Shows the stored script and what it outputs.
   *
   * @param line Line to focus afterwards, or null to keep the focus.
   */
  private render(line: number | null): void {
    const document = this.session.document();
    this.title.textContent = `SolidScript — ${this.session.name()}`;
    this.lines.render(document, line);
    this.selectLine(this.lines.caret());
    this.debugChanged();
  }

  /**
   * Follows undo, redo and edits of other users without disturbing the view:
   * the scroll, the current line, the selection and an open configurator stay.
   * When someone else deletes the line being configured, a notice says so.
   */
  private poll(): void {
    if (!this.session.exists()) return this.close();
    const revision = this.session.revision();
    if (revision === this.revision) return;
    this.revision = revision;
    this.debugger.stop();
    const document = this.session.document();
    this.title.textContent = `SolidScript — ${this.session.name()}`;
    this.lines.renderKeeping(document);
    this.selectLine(this.lines.caret());
    this.debugChanged();
    const configuring = this.lineConfigure.configuring();
    if (configuring !== null && !document.blocks.some((block) => block.id === configuring))
      this.noticeShow(SOLID_SCRIPT_EDITOR_CONFIGURED_GONE);
  }

  /**
   * Shows the debugger state on the lines, the toolbar, the output and the
   * status bar.
   */
  private debugChanged(): void {
    const stepped = this.debugger.line();
    const atBreak = this.debugger.atBreakpoint();
    this.output.show(
      this.session.document(),
      this.debugger.runOptions() ?? this.session.runStart(),
      this.debugCaption(),
    );
    const traced = new Set(this.tracing ? this.output.linesPassed() : []);
    const breakpoints = this.breakpointLines();
    const runs = this.output.lineRuns();
    const failed = this.output.failedLine();
    this.lines.mark({ stepped, failed, error: this.output.failedNames(), traced, breakpoints, atBreak, runs });
    this.toolbar.stateShow(this.debugger.stateGet(), atBreak);
    this.statusRefresh();
  }

  /**
   * Describes where the variables were captured: nowhere for a script with
   * nothing to run, at a breakpoint before its line runs, at a debugger step,
   * or at the end of the run.
   *
   * @returns Caption, and the line the run stopped just before.
   */
  private debugCaption(): SolidScriptExplorerRun {
    const line = this.debugger.line();
    const blocks = this.session.document().blocks;
    if (blocks.every((block) => solidScriptBlockIsBlank(block)))
      return { caption: 'Nothing ran yet', stoppedBefore: null, ran: false };
    if (this.debugger.stateGet() === 'stopped' || line === null)
      return { caption: 'At the end of the run', stoppedBefore: null, ran: true };
    if (this.debugger.atBreakpoint())
      return {
        caption: `Stopped at the breakpoint on line ${line + 1}, before it runs`,
        stoppedBefore: line,
        ran: true,
      };
    return { caption: `At step ${this.debugger.position().step}, line ${line + 1}`, stoppedBefore: null, ran: true };
  }

  /**
   * Returns the 0-based lines that hold a breakpoint.
   *
   * @returns Line indices.
   */
  private breakpointLines(): Set<number> {
    const { node, stepId } = this.session;
    const lines = solidScriptDebugBreakpointLines(this.session.document(), solidScriptDebugBreakpoints(node, stepId));
    return new Set([...lines].map((line) => line - 1));
  }

  /**
   * Sets or clears the breakpoint of a line. Lines that do nothing when the
   * script runs (notes, blank lines, End, Else) cannot hold one.
   *
   * @param line Line index.
   */
  private breakpointToggle(line: number): void {
    const block = this.session.document().blocks[line];
    if (!block) return;
    if (!solidScriptDebugBreakpointAllowed(block))
      return this.noticeShow('Notes, blank lines, End and Else do not run, so they cannot hold a breakpoint.');
    const { node, stepId } = this.session;
    const on = !solidScriptDebugBreakpoints(node, stepId).has(block.id);
    solidScriptDebugBreakpointSet(node, stepId, block.id, on);
    this.debugger.breakpointsChanged();
    this.debugChanged();
    this.noticeShow(
      on
        ? `Breakpoint on line ${line + 1}: Start and Debug pause before it runs.`
        : `Breakpoint on line ${line + 1} cleared.`,
    );
  }

  /**
   * Turns tracing of passed lines on or off.
   *
   * @param on True traces.
   */
  private traceSet(on: boolean): void {
    this.tracing = on;
    this.debugChanged();
  }

  /** Writes the status bar. */
  private statusRefresh(): void {
    const { step, count } = this.debugger.position();
    const line = this.debugger.line();
    const debugging = this.debugger.stateGet() !== 'stopped';
    const stepText = this.debugger.atBreakpoint()
      ? `Paused at the breakpoint on line ${(line ?? 0) + 1} · Step (F10) or Continue (F5)`
      : `Step ${step} of ${count}${line === null ? '' : ` · Line ${line + 1}`}`;
    this.status.textContent = this.notice || (debugging ? stepText : SOLID_SCRIPT_EDITOR_HINT);
  }

  /**
   * Shows a message in the status bar for a while.
   *
   * @param text Message.
   */
  private noticeShow(text: string): void {
    this.notice = text;
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = '';
      this.statusRefresh();
    }, SOLID_SCRIPT_EDITOR_NOTICE_MS);
    this.statusRefresh();
  }

  /**
   * Shows the help of the current line.
   *
   * @param line Line index.
   */
  private selectLine(line: number): void {
    const block = this.session.document().blocks[line];
    this.output.contextLineSet(block ? line : null);
    const command = block ? solidScriptCommandFind(block.command) : undefined;
    if (block && command && !solidScriptBlockIsBlank(block)) this.help.show(command, block);
    else this.help.clear();
  }

  /**
   * Inserts a Select line above a tool that stopped for an empty Of, already
   * set to Which Between, and does not open the configurator.
   *
   * @param command Select command id.
   * @param line 0-based index of the failed tool.
   */
  private selectAbove(command: string, line: number): void {
    const found = solidScriptCommandFind(command);
    if (!found) return;
    const values = { ...found.valuesDefault(), which: SOLID_SCRIPT_SELECT_BETWEEN };
    const inserted = solidScriptDocumentCommandInsert(this.session.document(), command, line, 'before', values);
    this.commit(inserted.document, inserted.line);
  }

  /**
   * Opens a command a help text mentions: selects it in the palette, scrolls to
   * it and shows its help.
   *
   * @param command Command id.
   */
  private commandReveal(command: string): void {
    this.palette?.reveal(command);
  }

  /**
   * Replaces the script with one dropped from the project browser or the
   * desktop.
   *
   * @param result Dropped script or why there is none.
   */
  private dropped(result: SolidScriptFileDropResult): void {
    if ('error' in result) return this.noticeShow(result.error);
    this.commit(result.document, 0);
    this.noticeShow(`Loaded ${result.document.name}`);
  }

  /** Starts a new script with one Cube; Undo brings the old one back. */
  private create(): void {
    this.commit(this.scriptForHost([{ command: 'cube' }], SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT), 0);
    this.noticeShow('New script. Undo brings the old one back.');
  }

  /** Opens a built-in example as a new script. */
  private async examples(): Promise<void> {
    const example = await solidScriptExamplesAsk(this.root.ownerDocument.body);
    if (!example) return;
    this.commit(this.scriptForHost(example.lines, example.name, example.uses), 0);
    this.noticeShow(`Opened the ${example.name} example. Undo brings your script back.`);
  }

  /**
   * Builds a script for this window's host. New, and examples that set no uses,
   * take the host's type: Modifier when opened from Add Modifier, Generator
   * from a generator.
   *
   * @param lines Command lines.
   * @param name Script name.
   * @param uses Uses from an example, when it has them.
   * @returns Script.
   */
  private scriptForHost(lines: readonly SolidScriptLine[], name: string, uses?: SolidScriptUses): SolidScriptDocument {
    const created = solidScriptDocumentCreate(lines, name);
    const use = this.session.use();
    return solidScriptDocumentUsesWith(
      created,
      uses ?? { generator: use === 'generator', modifier: use === 'modifier' },
    );
  }

  /** Saves the script and keeps the name it was saved under. */
  private async save(): Promise<void> {
    try {
      const result = await solidScriptEditorSave(this.root.ownerDocument.body, this.session.document());
      if (!result) return;
      this.commit({ ...this.session.document(), name: result.document.name }, null);
      this.noticeShow(result.message);
    } catch (error) {
      this.noticeShow(error instanceof Error ? error.message : 'Saving the script failed.');
    }
  }

  /** Replaces the script with a saved one. */
  private async load(): Promise<void> {
    try {
      const document = await solidScriptEditorLoad(this.root.ownerDocument.body);
      if (!document) return;
      this.commit(document, 0);
      this.noticeShow(`Loaded ${document.name}`);
    } catch (error) {
      this.noticeShow(error instanceof Error ? error.message : 'Loading the script failed.');
    }
  }
}
