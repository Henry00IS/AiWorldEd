import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon, solidScriptEditorToolButton } from './solid_script_editor_icons.js';
import type { SolidScriptDebuggerState } from './solid_script_editor_debugger.js';

/** What the toolbar buttons do. */
export interface SolidScriptEditorToolbarActions {
  /** Runs or pauses the script one solid at a time. */
  play: () => void;
  /** Builds the next solid. */
  step: () => void;
  /** Stops debugging and shows the whole script. */
  stop: () => void;
  /** Turns tracing of passed lines on or off. */
  trace: (on: boolean) => void;
  /** Saves the script. */
  save: () => void;
  /** Replaces the script with a saved one. */
  load: () => void;
}

/** Toolbar of the script editor: debugger controls, tracing and files. */
export class SolidScriptEditorToolbar {
  /** Toolbar element. */
  readonly element = document.createElement('div');
  private readonly play: HTMLButtonElement;
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
    this.play = solidScriptEditorToolButton('Run', 'play', 'Build the script one solid at a time', actions.play);
    const step = solidScriptEditorToolButton('Step', 'step', 'Build the next solid (F10)', actions.step);
    this.stop = solidScriptEditorToolButton('Stop', 'stop', 'Stop and show the whole script', actions.stop);
    this.trace = solidScriptEditorToolButton('Trace', 'trace', 'Mark every line the run has passed', () => {
      this.tracing = !this.tracing;
      this.trace.setAttribute('aria-pressed', String(this.tracing));
      actions.trace(this.tracing);
    });
    this.trace.setAttribute('aria-pressed', 'false');
    const save = solidScriptEditorToolButton('Save…', 'save', 'Save the script as an .aiscript file', actions.save);
    const load = solidScriptEditorToolButton('Load…', 'load', 'Replace the script with a saved one', actions.load);
    this.element.append(this.play, step, this.stop, this.separator(), this.trace, this.separator(), save, load);
  }

  /**
   * Shows the debugger state on the buttons.
   *
   * @param state Debugger state.
   */
  stateShow(state: SolidScriptDebuggerState): void {
    const playing = state === 'playing';
    this.play.replaceChildren(solidScriptEditorIcon(playing ? 'pause' : 'play'), playing ? 'Pause' : 'Run');
    this.play.setAttribute('aria-pressed', String(playing));
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
