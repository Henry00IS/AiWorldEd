import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptBlockIsBlank,
  solidScriptDocumentCommandInsert,
  solidScriptDocumentCommandWrap,
  solidScriptDocumentLineSet,
  type SolidScriptInsertMode,
} from '@/solid_script/document/solid_script_document_edit.js';
import { solidScriptBlockNesting } from '@/solid_script/document/solid_script_document_indent.js';
import type { SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import type { SolidScriptInput } from '@/solid_script/language/solid_script_input.js';
import { SolidScriptConfigurator } from './solid_script_configurator.js';
import type { SolidScriptDialog } from './solid_script_dialog.js';

/** Notice when another user deletes the line being configured. */
export const SOLID_SCRIPT_EDITOR_CONFIGURED_GONE =
  'Someone else deleted the line you are changing. Your values were not stored; Cancel closes the window.';

/** What inserting and configuring lines needs from the editor around them. */
export interface SolidScriptEditorLineConfigureHost {
  /** Commands the lines are found in. */
  catalog: SolidScriptCommandCatalog;
  /** Returns the lines as they are now. */
  document: () => SolidScriptDocument;
  /** Stores edited lines, then focuses a line. */
  commit: (document: SolidScriptDocument, line: number) => void;
  /** Shows a short message. */
  notice: (text: string) => void;
  /** Names a line at an index sees, for suggestions and checks. */
  names: (document: SolidScriptDocument, line: number) => readonly SolidScriptName[];
  /** Input lines whose words choice fields offer. */
  inputs: (document: SolidScriptDocument) => readonly SolidScriptInput[];
  /** Names every field of every line fills in, such as $Face. */
  fills: () => readonly string[];
  /** Element the configurator windows mount in. */
  mount: () => HTMLElement;
  /** Dialog the configurator windows open over, or null for the editor itself. */
  parent: () => SolidScriptDialog | null;
}

/**
 * Inserts command lines and opens their configurator windows: a new line with
 * values is configured first, then inserted; a block command wraps selected
 * lines whose blocks are whole.
 */
export class SolidScriptEditorLineConfigure {
  /** Id of the line whose configurator is open, or null. */
  private open: string | null = null;

  /**
   * Creates the line configuring of an editor.
   *
   * @param host Editor callbacks.
   */
  constructor(private readonly host: SolidScriptEditorLineConfigureHost) {}

  /**
   * Returns the id of the line whose configurator is open.
   *
   * @returns Line id, or null.
   */
  configuring(): string | null {
    return this.open;
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
  insert(
    command: string,
    line: number,
    mode: SolidScriptInsertMode,
    start: Record<string, string> = {},
    selected: [number, number] | null = null,
  ): void {
    const found = this.host.catalog.find(command);
    if (!found) return;
    const wraps = selected !== null && this.wrapped(this.host.document(), command, selected) !== null;
    const place = (values?: Record<string, string>): void => {
      const document = this.host.document();
      const inserted =
        (wraps && selected ? this.wrapped(document, command, selected, values) : null) ??
        solidScriptDocumentCommandInsert(document, command, line, mode, values, this.host.catalog);
      this.host.commit(inserted.document, inserted.line);
    };
    if (found.parameters.length === 0) return place();
    const at = wraps && selected ? selected[0] : mode === 'caret' ? line + 1 : line;
    this.window(found, { ...found.valuesDefault(), ...start }, at, place, null);
  }

  /**
   * Opens the configurator of a command line.
   *
   * @param line Line index.
   */
  configure(line: number): void {
    const block = this.host.document().blocks[line];
    const command = block ? this.host.catalog.find(block.command) : undefined;
    if (!block || solidScriptBlockIsBlank(block))
      return this.host.notice('Blank line: double-click a command in the palette to fill it.');
    if (!command) return this.host.notice(`This editor does not know the command “${block.command}”.`);
    if (command.parameters.length === 0)
      return this.host.notice(
        `${solidScriptBlockNesting(block, this.host.catalog) === 'close' ? 'End' : command.label} has nothing to configure.`,
      );
    const apply = (values: Record<string, string>): void => {
      this.open = null;
      const document = this.host.document();
      const index = document.blocks.findIndex((candidate) => candidate.id === block.id);
      if (index < 0) return this.host.notice(SOLID_SCRIPT_EDITOR_CONFIGURED_GONE);
      const current = document.blocks[index] ?? block;
      this.host.commit(solidScriptDocumentLineSet(document, index, { ...current, values }), index);
    };
    this.open = block.id;
    this.window(command, block.values, line, apply, () => (this.open = null));
  }

  /**
   * Wraps selected lines in a block command, or returns null when they cannot
   * be wrapped.
   *
   * @param document Lines.
   * @param command Block command id.
   * @param selected First and last selected line.
   * @param values Configured values, or the defaults when omitted.
   * @returns Edited lines and the command's line, or null.
   */
  private wrapped(
    document: SolidScriptDocument,
    command: string,
    selected: [number, number],
    values?: Record<string, string>,
  ): ReturnType<typeof solidScriptDocumentCommandWrap> {
    return solidScriptDocumentCommandWrap(document, command, selected[0], selected[1], values, this.host.catalog);
  }

  /**
   * Shows the configurator window of a command.
   *
   * @param command Command.
   * @param values Values it starts with.
   * @param line Line whose names the fields see.
   * @param apply Stores the configured values.
   * @param cancelled Runs when the window closes without storing, or null.
   */
  private window(
    command: SolidScriptCommand,
    values: Readonly<Record<string, string>>,
    line: number,
    apply: (values: Record<string, string>) => void,
    cancelled: (() => void) | null,
  ): void {
    const document = this.host.document();
    new SolidScriptConfigurator(
      this.host.mount(),
      command,
      values,
      apply,
      this.host.names(document, line),
      cancelled,
      this.host.inputs(document),
      this.host.fills(),
      this.host.parent(),
    ).show();
  }
}
