import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon, solidScriptEditorToolButton } from './solid_script_editor_icons.js';
import type { SolidScriptDebuggerState } from './solid_script_editor_debugger.js';

/** What the toolbar buttons do. */
export interface SolidScriptEditorToolbarActions {
  /** Builds the whole script at once. */
  start: () => void;
  /** Builds or pauses the script one solid at a time. */
  debug: () => void;
  /** Builds the next solid. */
  step: () => void;
  /** Stops debugging and shows the whole script. */
  stop: () => void;
  /** Turns tracing of passed lines on or off. */
  trace: (on: boolean) => void;
  /** Turns the selected lines off or on. */
  toggle: () => void;
  /** Starts a new script. */
  create: () => void;
  /** Opens a built-in example as a new script. */
  examples: () => void;
  /** Saves the script. */
  save: () => void;
  /** Replaces the script with a saved one. */
  load: () => void;
}

/**
 * Toolbar of the script editor: Start (the whole script at once), Debug (one
 * solid at a time), Step and Stop, then tracing and files.
 */
export class SolidScriptEditorToolbar {
  /** Toolbar element. */
  readonly element = document.createElement('div');
  private readonly debug: HTMLButtonElement;
  private readonly stop: HTMLButtonElement;
  private readonly trace: HTMLButtonElement;
  private tracing = false;

  /**
   * Builds the toolbar.
   *
   * @param actions Button actions.
   */
  constructor(actions: SolidScriptEditorToolbarActions) {
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.toolbar;
    this.element.setAttribute('role', 'toolbar');
    const start = solidScriptEditorToolButton('Start', 'play', 'Build the whole script now (Ctrl+F5)', actions.start);
    this.debug = solidScriptEditorToolButton(
      'Debug',
      'debug',
      'Build the script one solid at a time (F5)',
      actions.debug,
    );
    const step = solidScriptEditorToolButton(
      'Step',
      'step',
      'Build the next solid (F10). Ctrl+F10 builds up to the line at the cursor',
      actions.step,
    );
    this.stop = solidScriptEditorToolButton(
      'Stop',
      'stop',
      'Stop debugging and show the whole script (Shift+F5)',
      actions.stop,
    );
    this.trace = solidScriptEditorToolButton(
      'Trace',
      'trace',
      'Mark every line the run passed, up to the debugger step or breakpoint; lines left unmarked did not run',
      () => {
        this.tracing = !this.tracing;
        this.trace.setAttribute('aria-pressed', String(this.tracing));
        actions.trace(this.tracing);
      },
    );
    this.trace.setAttribute('aria-pressed', 'false');
    const toggle = solidScriptEditorToolButton(
      'Off / On',
      'off',
      'Turn the selected lines off or on again: they stay but do not run (F4 or Ctrl+/)',
      actions.toggle,
    );
    const create = solidScriptEditorToolButton(
      'New',
      'new',
      'Start a new script (Undo brings this one back)',
      actions.create,
    );
    const examples = solidScriptEditorToolButton(
      'Examples…',
      'examples',
      'Open a built-in example as a new script',
      actions.examples,
    );
    const save = solidScriptEditorToolButton('Save…', 'save', 'Save the script as an .aiscript file', actions.save);
    const load = solidScriptEditorToolButton('Load…', 'load', 'Replace the script with a saved one', actions.load);
    this.element.append(
      start,
      this.debug,
      step,
      this.stop,
      this.separator(),
      this.trace,
      toggle,
      this.separator(),
      create,
      examples,
      save,
      load,
    );
  }

  /**
   * Shows the debugger state on the buttons.
   *
   * @param state Debugger state.
   * @param atBreak True while paused at a breakpoint: Debug continues.
   */
  stateShow(state: SolidScriptDebuggerState, atBreak: boolean): void {
    const playing = state === 'playing';
    const label = playing ? 'Pause' : atBreak ? 'Continue' : 'Debug';
    this.debug.replaceChildren(solidScriptEditorIcon(playing ? 'pause' : 'debug'), label);
    this.debug.setAttribute('aria-pressed', String(playing));
    this.stop.disabled = state === 'stopped';
  }

  /**
   * Builds a separator.
   *
   * @returns Separator element.
   */
  private separator(): HTMLElement {
    const separator = document.createElement('div');
    separator.className = SOLID_SCRIPT_EDITOR_CLASSES.toolSeparator;
    return separator;
  }
}
