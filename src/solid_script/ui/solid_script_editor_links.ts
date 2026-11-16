import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Opens a command in the palette by id. */
export type SolidScriptEditorLinkOpen = (command: string) => void;

/**
 * Palette commands by label, longest label first so Input Brushes wins over
 * Input.
 */
let solidScriptEditorLinkLabels: { label: string; id: string }[] | null = null;

/** Finds a palette label as a whole phrase. */
let solidScriptEditorLinkPattern: RegExp | null = null;

/**
 * Returns the palette labels and the pattern that finds them, built once.
 *
 * @returns Labels by label text and the pattern.
 */
function solidScriptEditorLinkTable(): { ids: Map<string, string>; pattern: RegExp } {
  if (!solidScriptEditorLinkLabels || !solidScriptEditorLinkPattern) {
    solidScriptEditorLinkLabels = solidScriptCommands
      .filter((command) => command.inPalette)
      .map((command) => ({ label: command.label, id: command.id }))
      .sort((a, b) => b.label.length - a.label.length);
    const escaped = solidScriptEditorLinkLabels.map((entry) => entry.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    solidScriptEditorLinkPattern = new RegExp(`(?<![\\w\\[])(?:${escaped.join('|')})(?![\\w\\]])`, 'g');
  }
  return {
    ids: new Map(solidScriptEditorLinkLabels.map((entry) => [entry.label, entry.id])),
    pattern: solidScriptEditorLinkPattern,
  };
}

/**
 * Returns whether a mention starts a sentence and is not followed by a field,
 * such as "If the list is empty", where the word is plain prose rather than a
 * block name.
 *
 * @param text Whole text.
 * @param at Start of the mention.
 * @param end End of the mention.
 * @returns True for prose.
 */
function solidScriptEditorLinkProse(text: string, at: number, end: number): boolean {
  const before = text.slice(0, at).trimEnd();
  const sentence = before === '' || /[.!?]$/.test(before);
  return sentence && !text.startsWith(' [', end);
}

/**
 * Fills an element with text where every mention of a palette command is a link
 * that opens it in the palette. Mentions of the command itself stay plain.
 *
 * @param element Element to fill; its children are replaced.
 * @param text Text.
 * @param open Opens a command, or null for plain text.
 * @param self Id of the command the text describes, or null.
 * @returns The element.
 */
export function solidScriptEditorLinked<T extends HTMLElement>(
  element: T,
  text: string,
  open: SolidScriptEditorLinkOpen | null,
  self: string | null = null,
): T {
  if (!open) {
    element.textContent = text;
    return element;
  }
  const { ids, pattern } = solidScriptEditorLinkTable();
  const parts: (string | HTMLElement)[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index;
    const end = at + match[0].length;
    const id = ids.get(match[0]);
    if (id === undefined || id === self || solidScriptEditorLinkProse(text, at, end)) continue;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(solidScriptEditorLink(match[0], id, open));
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  element.replaceChildren(...parts);
  return element;
}

/**
 * Builds one command link.
 *
 * @param label Shown label.
 * @param id Command id.
 * @param open Opens the command.
 * @returns Link element.
 */
function solidScriptEditorLink(label: string, id: string, open: SolidScriptEditorLinkOpen): HTMLElement {
  const link = document.createElement('a');
  link.className = SOLID_SCRIPT_EDITOR_CLASSES.helpLink;
  link.href = '#';
  link.dataset['command'] = id;
  link.textContent = label;
  link.title = `Show ${label} in the command list`;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    open(id);
  });
  return link;
}
