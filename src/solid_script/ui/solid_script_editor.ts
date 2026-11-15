import type * as THREE from 'three';
import type { ModifierStackActionTarget } from '@/modifier/stack/modifier_stack_types.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';
import { createFloatingPanelResizeGrip } from '@/ui/floating_panel/panel_floating_resize.js';
import { styleFloatingPanelStatusBar } from '@/ui/floating_panel/panel_floating_status_bar.js';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentCommandInsert,
  solidScriptDocumentLineSet,
  type SolidScriptInsertMode,
} from '@/solid_script/document/solid_script_document_edit.js';
import { SOLID_SCRIPT_EDITOR_CLASSES, solidScriptEditorStylesheetEnsure } from './solid_script_editor_css.js';
import { solidScriptEditorToolButton, solidScriptEditorIcon } from './solid_script_editor_icons.js';
import { SolidScriptEditorSession } from './solid_script_editor_session.js';
import { SolidScriptEditorPalette } from './solid_script_editor_palette.js';
import { SolidScriptEditorLines, type SolidScriptEditorFocus } from './solid_script_editor_lines.js';
import { SolidScriptEditorDebugger } from './solid_script_editor_debugger.js';
import { SolidScriptConfigurator } from './solid_script_configurator.js';
import { SolidScriptEditorOutput } from './solid_script_editor_output.js';
import { solidScriptEditorLoad, solidScriptEditorSave } from './solid_script_editor_files.js';

/** First size of the editor window. */
const SOLID_SCRIPT_EDITOR_SIZE = { width: 800, height: 560 };

/** Smallest size of the editor window. */
const SOLID_SCRIPT_EDITOR_MIN_SIZE = { width: 540, height: 320 };

/** How often the editor looks for changes made elsewhere, in ms. */
const SOLID_SCRIPT_EDITOR_POLL_MS = 400;

/** How long a status message stays, in ms. */
const SOLID_SCRIPT_EDITOR_NOTICE_MS = 4000;

/** Status bar text while nothing else is shown. */
const SOLID_SCRIPT_EDITOR_HINT =
  'Drag a command into the script, or double-click it to add it at the caret. Double-click a command line to configure it.';

/** Names scripts were last saved or loaded as, by generator node uuid. */
const solidScriptEditorNames = new Map<string, string>();

/**
 * The script editor window of a SolidScript generator: commands on the left,
 * the script on the right, a debugger in the toolbar and the script's output
 * below.
 */
export class SolidScriptEditor extends PanelFloating {
  private readonly session: SolidScriptEditorSession;
  private readonly lines: SolidScriptEditorLines;
  private readonly debugger: SolidScriptEditorDebugger;
  private readonly output = new SolidScriptEditorOutput();
  private readonly status = document.createElement('div');
  private readonly title = document.createElement('span');
  private readonly buttons: Record<'play' | 'step' | 'stop', HTMLButtonElement>;
  private revision = '';
  private notice = '';
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
    this.session = new SolidScriptEditorSession(target.volume, target.stepId, target.commandStack);
    this.debugger = new SolidScriptEditorDebugger(this.session, () => this.debugChanged());
    this.lines = new SolidScriptEditorLines({
      edit: (document, focus) => this.commit(document, focus),
      configure: (line) => this.configure(line),
      insert: (command, drop) => this.insert(command, drop.line, 'before'),
      notice: (text) => this.noticeShow(text),
    });
    this.buttons = {
      play: solidScriptEditorToolButton('Play', 'play', 'Build the script one solid at a time', () =>
        this.debugger.play(),
      ),
      step: solidScriptEditorToolButton('Step', 'step', 'Build the next solid', () => this.debugger.stepOnce()),
      stop: solidScriptEditorToolButton('Stop', 'stop', 'Stop and show the whole script', () => this.debugger.stop()),
    };
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
    this.render({ line: 0 });
    this.pollTimer = setInterval(() => this.poll(), SOLID_SCRIPT_EDITOR_POLL_MS);
    this.target.commandStack?.onStackChanged(this.stackChanged);
  }

  /** Stores typed text, stops debugging and closes the window. */
  close(): void {
    this.lines.flush();
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
    const bar = this.createStandardTitleBar({
      titleText: '',
      titleElement: this.title,
      flexShrinkZero: true,
      onClose: () => this.close(),
    });
    const body = document.createElement('div');
    body.className = SOLID_SCRIPT_EDITOR_CLASSES.body;
    body.append(new SolidScriptEditorPalette((command) => this.insertAtCaret(command)).element, this.lines.element);
    styleFloatingPanelStatusBar(this.status);
    this.root.append(bar.bar, this.toolbar(), body, this.output.element, this.status, this.grip());
    this.root.addEventListener('keydown', (event) => this.key(event));
    this.root.addEventListener('mousedown', (event) => event.stopPropagation());
  }

  /**
   * Builds the toolbar.
   *
   * @returns Toolbar.
   */
  private toolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = SOLID_SCRIPT_EDITOR_CLASSES.toolbar;
    toolbar.setAttribute('role', 'toolbar');
    const separator = document.createElement('div');
    separator.className = SOLID_SCRIPT_EDITOR_CLASSES.toolSeparator;
    const save = solidScriptEditorToolButton(
      'Save…',
      'save',
      'Save the script as an .aiscript file',
      () => void this.save(),
    );
    const load = solidScriptEditorToolButton(
      'Load…',
      'load',
      'Replace the script with a saved .aiscript file',
      () => void this.load(),
    );
    toolbar.append(this.buttons.play, this.buttons.step, this.buttons.stop, separator, save, load);
    return toolbar;
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
   * Keeps keys inside the editor, except undo and redo, which the editor's own
   * shortcuts handle after typed text is stored.
   *
   * @param event Key event.
   */
  private key(event: KeyboardEvent): void {
    const history = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase());
    if (history) this.lines.flush();
    else event.stopPropagation();
  }

  /**
   * Stores an edited script, then shows it.
   *
   * @param document Script.
   * @param focus Line to focus afterwards.
   */
  private commit(document: SolidScriptDocument, focus: SolidScriptEditorFocus | null): void {
    if (!this.session.exists()) return this.close();
    this.debugger.stop();
    this.session.commit(document);
    this.revision = this.session.revision();
    this.render(focus);
  }

  /**
   * Shows the stored script and what it outputs.
   *
   * @param focus Line to focus afterwards, or null to keep the focus.
   */
  private render(focus: SolidScriptEditorFocus | null): void {
    const document = this.session.document();
    const name = solidScriptEditorNames.get(this.session.node.uuid);
    this.title.textContent = `SolidScript — ${name ?? this.session.name()}`;
    this.lines.render(document, focus);
    this.output.show(document);
    this.debugChanged();
  }

  /** Follows undo, redo and edits of other users. */
  private poll(): void {
    if (!this.session.exists()) return this.close();
    if (this.lines.typing()) return;
    const revision = this.session.revision();
    if (revision === this.revision) return;
    this.revision = revision;
    this.debugger.stop();
    this.render(null);
  }

  /** Shows the debugger state on the lines, the toolbar and the status bar. */
  private debugChanged(): void {
    const state = this.debugger.stateGet();
    this.lines.mark({ stepped: this.debugger.line(), failed: this.output.failedLine() });
    const playing = state === 'playing';
    this.buttons.play.replaceChildren(solidScriptEditorIcon(playing ? 'pause' : 'play'), playing ? 'Pause' : 'Play');
    this.buttons.play.setAttribute('aria-pressed', String(playing));
    this.buttons.stop.disabled = state === 'stopped';
    this.statusRefresh();
  }

  /** Writes the status bar. */
  private statusRefresh(): void {
    const { step, count } = this.debugger.position();
    const line = this.debugger.line();
    const debugging = this.debugger.stateGet() !== 'stopped';
    const stepText = `Step ${step} of ${count}${line === null ? '' : ` · Line ${line + 1}`}`;
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
   * Inserts a palette command at the caret line.
   *
   * @param command Command id.
   */
  private insertAtCaret(command: string): void {
    this.lines.flush();
    this.insert(command, this.lines.caret(), 'caret');
  }

  /**
   * Configures a new command line, then inserts it; commands without values go
   * in at once.
   *
   * @param command Command id.
   * @param line Caret line or drop target.
   * @param mode Below the caret line, or before the drop target.
   */
  private insert(command: string, line: number, mode: SolidScriptInsertMode): void {
    const found = solidScriptCommandFind(command);
    if (!found) return;
    const place = (values?: Record<string, string>): void => {
      const inserted = solidScriptDocumentCommandInsert(this.session.document(), command, line, mode, values);
      this.commit(inserted.document, { line: inserted.line });
    };
    if (found.parameters.length === 0) return place();
    new SolidScriptConfigurator(this.root.ownerDocument.body, found, found.valuesDefault(), place).show();
  }

  /**
   * Opens the configurator of a command line.
   *
   * @param line Line index.
   */
  private configure(line: number): void {
    const block = this.session.document().blocks[line];
    if (block?.type !== 'command') return;
    const command = solidScriptCommandFind(block.command);
    if (!command) return this.noticeShow(`This editor does not know the command “${block.command}”.`);
    if (command.id === SOLID_SCRIPT_COMMAND_END)
      return this.noticeShow('End closes the block above; it has nothing to configure.');
    new SolidScriptConfigurator(this.root.ownerDocument.body, command, block.values, (values) => {
      const document = this.session.document();
      const index = document.blocks.findIndex((candidate) => candidate.id === block.id);
      if (index >= 0) this.commit(solidScriptDocumentLineSet(document, index, { ...block, values }), { line: index });
    }).show();
  }

  /** Saves the script. */
  private async save(): Promise<void> {
    this.lines.flush();
    const name = solidScriptEditorNames.get(this.session.node.uuid) ?? this.session.name();
    try {
      const result = await solidScriptEditorSave(this.root.ownerDocument.body, this.session.document(), name);
      if (!result) return;
      solidScriptEditorNames.set(this.session.node.uuid, result.name);
      this.render(null);
      this.noticeShow(result.message);
    } catch (error) {
      this.noticeShow(error instanceof Error ? error.message : 'Saving the script failed.');
    }
  }

  /** Replaces the script with a saved one. */
  private async load(): Promise<void> {
    this.lines.flush();
    try {
      const result = await solidScriptEditorLoad(this.root.ownerDocument.body);
      if (!result) return;
      solidScriptEditorNames.set(this.session.node.uuid, result.name);
      this.commit(result.document, { line: 0 });
      this.noticeShow(`Loaded ${result.name}`);
    } catch (error) {
      this.noticeShow(error instanceof Error ? error.message : 'Loading the script failed.');
    }
  }
}
