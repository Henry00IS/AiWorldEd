import { solidScriptExamplesAsk } from './solid_script_examples_dialog.js';
import type * as THREE from 'three';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { styleFloatingPanelStatusBar } from '@/ui/floating_panel/panel_floating_status_bar.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT,
  solidScriptDocumentCreate,
  solidScriptDocumentUsesWith,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentCommandInsert,
  solidScriptDocumentCommandWrap,
  solidScriptDocumentLineSet,
  type SolidScriptInsertMode,
} from '@/solid_script/document/solid_script_document_edit.js';
import {
  solidScriptBlockNesting,
  solidScriptDocumentDepths,
} from '@/solid_script/document/solid_script_document_indent.js';
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
import { SolidScriptConfigurator } from './solid_script_configurator.js';
import { SolidScriptEditorSettings } from './solid_script_editor_settings.js';
import { solidScriptEditorSizesRead, solidScriptEditorSplitter } from './solid_script_editor_splitters.js';
import { SolidScriptEditorOutput } from './solid_script_editor_output.js';
import { solidScriptEditorLoad, solidScriptEditorSave } from './solid_script_editor_files.js';
import { solidScriptFileDropBind, type SolidScriptFileDropResult } from './solid_script_file_drop.js';
import { SOLID_SCRIPT_COMMAND_INPUT } from '@/solid_script/language/solid_script_input.js';

/** Notice when another user deletes the line being configured. */
const SOLID_SCRIPT_EDITOR_CONFIGURED_GONE =
  'Someone else deleted the line you are changing. Your values were not stored; Cancel closes the window.';

/** First size of the editor window. */

const SOLID_SCRIPT_EDITOR_SIZE = { width: 940, height: 600 };

/** Smallest size of the editor window. */
const SOLID_SCRIPT_EDITOR_MIN_SIZE = { width: 640, height: 360 };

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
  private revision = '';
  /** Id of the line whose configurator is open, or null. */
  private configuring: string | null = null;
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
    this.lines = new SolidScriptEditorLines({
      edit: (document, line) => this.commit(document, line),
      configure: (line) => this.configure(line),
      insert: (command, drop) => this.insert(command, drop.line, 'before'),
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
      ),
    );
    this.output.inputAdd = () => {
      const blocks = this.session.document().blocks;
      const last = blocks.map((block) => block.command).lastIndexOf(SOLID_SCRIPT_COMMAND_INPUT);
      const used = new Set(solidScriptDocumentNames(this.session.document()).map((entry) => entry.name));
      let name = 'width';
      for (let index = 2; used.has(name); index++) name = `input${index}`;
      this.insert(SOLID_SCRIPT_COMMAND_INPUT, Math.max(0, last), last >= 0 ? 'caret' : 'before', { name });
    };
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
    this.dispose();
    this.closed();
  }

  /** Places the window near the top centre of the screen. */
  protected override onAfterShow(): void {
    const view = this.root.ownerDocument.defaultView ?? window;
    const left = Math.max(16, (view.innerWidth - SOLID_SCRIPT_EDITOR_SIZE.width) / 2);
    this.setTopLeftPosition(left, Math.max(56, (view.innerHeight - SOLID_SCRIPT_EDITOR_SIZE.height) / 3));
    this.clampToScreen();
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
      (command) => this.insert(command, this.lines.caret(), 'caret', {}, this.lines.selectedRun()),
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
    return createFloatingPanelResizeGrip(this.root, {
      minWidth: SOLID_SCRIPT_EDITOR_MIN_SIZE.width,
      minHeight: SOLID_SCRIPT_EDITOR_MIN_SIZE.height,
      place: (left, top) => this.setTopLeftPosition(left, top),
      done: () => this.clampToScreen(),
    });
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
    if (this.configuring !== null && !document.blocks.some((block) => block.id === this.configuring))
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
    const traced = new Set(this.tracing ? this.debugger.passedLines() : []);
    const breakpoints = this.breakpointLines();
    const runs = this.output.lineRuns();
    const failed = this.output.failedLine();
    this.lines.mark({ stepped, failed, error: this.output.failedNames(), traced, breakpoints, atBreak, runs });
    this.toolbar.stateShow(this.debugger.stateGet(), atBreak);
    this.statusRefresh();
  }

  /**
   * Describes what the variables show.
   *
   * @returns Caption.
   */
  private debugCaption(): string {
    const line = this.debugger.line();
    if (this.debugger.stateGet() === 'stopped' || line === null) return 'After the last solid';
    if (this.debugger.atBreakpoint()) return `Paused at the breakpoint on line ${line + 1}`;
    return `At step ${this.debugger.position().step}, line ${line + 1}`;
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
    const command = block ? solidScriptCommandFind(block.command) : undefined;
    if (block && command && !solidScriptBlockIsBlank(block)) this.help.show(command, block);
    else this.help.clear();
  }

  /**
   * Configures a new command line, then inserts it; commands without values go
   * in at once. A block command wraps selected lines whose blocks are whole;
   * otherwise it goes in like any other.
   *
   * @param command Command id.
   * @param line Current line or drop target.
   * @param mode Below the current line, or before the drop target.
   * @param start Values that replace the command's defaults.
   * @param selected First and last selected line, to wrap, or null.
   */
  private insert(
    command: string,
    line: number,
    mode: SolidScriptInsertMode,
    start: Record<string, string> = {},
    selected: [number, number] | null = null,
  ): void {
    const found = solidScriptCommandFind(command);
    if (!found) return;
    const wraps =
      selected !== null && solidScriptDocumentCommandWrap(this.session.document(), command, ...selected) !== null;
    const place = (values?: Record<string, string>): void => {
      const document = this.session.document();
      const inserted =
        (wraps && selected ? solidScriptDocumentCommandWrap(document, command, ...selected, values) : null) ??
        solidScriptDocumentCommandInsert(document, command, line, mode, values);
      this.commit(inserted.document, inserted.line);
    };
    if (found.parameters.length === 0) return place();
    const at = wraps && selected ? selected[0] : mode === 'caret' ? line + 1 : line;
    const names = solidScriptDocumentNamesAt(this.session.document(), at);
    const values = { ...found.valuesDefault(), ...start };
    new SolidScriptConfigurator(this.root.ownerDocument.body, found, values, place, names).show();
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
   * Opens the configurator of a command line.
   *
   * @param line Line index.
   */
  private configure(line: number): void {
    const block = this.session.document().blocks[line];
    const command = block ? solidScriptCommandFind(block.command) : undefined;
    if (!block || solidScriptBlockIsBlank(block))
      return this.noticeShow('Blank line: double-click a command in the palette to fill it.');
    if (!command) return this.noticeShow(`This editor does not know the command “${block.command}”.`);
    if (command.parameters.length === 0)
      return this.noticeShow(
        `${solidScriptBlockNesting(block) === 'close' ? 'End' : command.label} has nothing to configure.`,
      );
    const names = solidScriptDocumentNamesAt(this.session.document(), line);
    const apply = (values: Record<string, string>): void => {
      this.configuring = null;
      const document = this.session.document();
      const index = document.blocks.findIndex((candidate) => candidate.id === block.id);
      if (index < 0) return this.noticeShow(SOLID_SCRIPT_EDITOR_CONFIGURED_GONE);
      const current = document.blocks[index] ?? block;
      this.commit(solidScriptDocumentLineSet(document, index, { ...current, values }), index);
    };
    this.configuring = block.id;
    new SolidScriptConfigurator(
      this.root.ownerDocument.body,
      command,
      block.values,
      apply,
      names,
      () => (this.configuring = null),
    ).show();
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
    this.commit(solidScriptDocumentCreate([{ command: 'cube' }], SOLID_SCRIPT_DOCUMENT_NAME_DEFAULT), 0);
    this.noticeShow('New script. Undo brings the old one back.');
  }

  /** Opens a built-in example as a new script. */
  private async examples(): Promise<void> {
    const example = await solidScriptExamplesAsk(this.root.ownerDocument.body);
    if (!example) return;
    const created = solidScriptDocumentCreate(example.lines, example.name);
    this.commit(example.uses ? solidScriptDocumentUsesWith(created, example.uses) : created, 0);
    this.noticeShow(`Opened the ${example.name} example. Undo brings your script back.`);
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
