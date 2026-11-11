import { timeRelativeText } from '@/utils/utils_time_relative.js';
import { textCount } from '@/utils/utils_plural.js';
import { dialogCardButton } from '@/ui/dialog/dialog_card.js';
import {
  PROJECT_HISTORY_NAME_MAX,
  PROJECT_HISTORY_NOTE_MAX,
  projectHistoryNodeFind,
  type ProjectHistoryNode,
} from '@/project/history/tree/project_history_tree.js';
import { projectHistoryTreeChildCount } from '@/project/history/tree/project_history_tree_layout.js';
import {
  DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
  DIALOG_PROJECT_HISTORY_DANGER_TEXT,
  DIALOG_PROJECT_HISTORY_TEXT_MAIN,
  DIALOG_PROJECT_HISTORY_TEXT_MUTED,
  DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  dialogProjectHistoryFieldStyle,
  dialogProjectHistoryFields,
  dialogProjectHistoryHereThumb,
  dialogProjectHistoryInput,
  dialogProjectHistoryLock,
  dialogProjectHistoryNote,
  dialogProjectHistoryText,
  dialogProjectHistoryThumb,
} from './dialog_project_history_style.js';
import {
  dialogProjectHistoryAbsolute,
  dialogProjectHistoryChange,
  dialogProjectHistoryNodeName,
  dialogProjectHistoryNodeRef,
  dialogProjectHistorySpan,
} from './dialog_project_history_text.js';
import type { DialogProjectHistoryTree } from './dialog_project_history_types.js';

/** What the detail panel asks for. */
export interface DialogProjectHistoryDetailEvents {
  /**
   * Restore was pressed.
   *
   * @param node Node.
   */
  restore(node: ProjectHistoryNode): void;
  /**
   * Open As Copy was pressed.
   *
   * @param node Node.
   */
  copy(node: ProjectHistoryNode): void;
  /**
   * Rename or Name And Keep was pressed.
   *
   * @param node Node.
   */
  renameStart(node: ProjectHistoryNode): void;
  /**
   * A name was entered, or Clear Name pressed (empty name).
   *
   * @param node Node.
   * @param name New name.
   */
  rename(node: ProjectHistoryNode, name: string): void;
  /**
   * The note changed.
   *
   * @param node Node.
   * @param note New note.
   */
  note(node: ProjectHistoryNode, note: string): void;
  /**
   * Delete was pressed or confirmed.
   *
   * @param node Node.
   */
  remove(node: ProjectHistoryNode): void;
  /**
   * The panel needs a thumbnail.
   *
   * @param node Node.
   * @param box Thumbnail box to fill.
   */
  thumbnail(node: ProjectHistoryNode, box: HTMLElement): void;
  /** Hands keyboard focus back to the tree. */
  focusTree(): void;
}

/** What the detail panel is doing besides showing the state. */
export type DialogProjectHistoryDetailMode = 'view' | 'rename' | 'confirm-delete';

/** Detail panel of the selected state: thumbnail, facts, name, note, actions. */
export class DialogProjectHistoryDetail {
  private readonly events: DialogProjectHistoryDetailEvents;
  private target: HTMLElement | null = null;

  /**
   * Creates the panel renderer.
   *
   * @param events Panel callbacks.
   */
  constructor(events: DialogProjectHistoryDetailEvents) {
    this.events = events;
  }

  /**
   * Draws the panel.
   *
   * @param target Container to fill.
   * @param tree Tree.
   * @param node Selected node, or null for "You Are Here".
   * @param state Mode and current time.
   */
  render(
    target: HTMLElement,
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode | null,
    state: { mode: DialogProjectHistoryDetailMode; now: number },
  ): void {
    this.target = target;
    if (node === null) target.replaceChildren(...this.here(tree, state.now));
    else target.replaceChildren(...this.saved(tree, node, state));
  }

  /**
   * Focuses the name field while renaming, or Delete Snapshot while asking, and
   * scrolls it into view.
   *
   * @returns Whether a field took focus.
   */
  focusField(): boolean {
    const field = this.target?.querySelector<HTMLElement>('[data-history-focus]') ?? null;
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
    if (field instanceof HTMLInputElement) field.select();
    return field !== null;
  }

  /**
   * Builds the panel of "You Are Here".
   *
   * @param tree Current tree.
   * @param now Current time.
   * @returns Elements.
   */
  private here(tree: DialogProjectHistoryTree, now: number): HTMLElement[] {
    const marker = projectHistoryNodeFind(tree.index, tree.index.marker);
    const title = dialogProjectHistoryText('You Are Here', DIALOG_PROJECT_HISTORY_ACCENT_TEXT);
    Object.assign(title.style, { display: 'block', fontSize: '15px', fontWeight: '700', margin: '12px 0 4px' });
    const kind = dialogProjectHistoryKind(
      tree.kind === 'room' ? 'The room as it is now' : 'Your current work in the editor',
    );
    const fields = dialogProjectHistoryFields([
      ['Grew From', marker === null ? 'Nothing saved yet' : dialogProjectHistoryNodeRef(marker)],
      ['Unsaved', tree.pending ? 'Changes since the last save' : 'No changes'],
      ['Now', dialogProjectHistoryAbsolute(now)],
    ]);
    const note = dialogProjectHistoryNote(
      'The next autosave adds to the editing session on this branch. Take Snapshot keeps it as it is now under a name.',
    );
    return [dialogProjectHistoryHereThumb(true), title, kind, fields, note];
  }

  /**
   * Builds the panel of a saved state.
   *
   * @param tree Tree.
   * @param node Node.
   * @param state Mode and current time.
   * @returns Elements.
   */
  private saved(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
    state: { mode: DialogProjectHistoryDetailMode; now: number },
  ): HTMLElement[] {
    const thumb = dialogProjectHistoryThumb(null, null);
    this.events.thumbnail(node, thumb);
    const caption = dialogProjectHistoryKind(dialogProjectHistoryCaption(node));
    caption.style.margin = '6px 0 10px';
    const head = state.mode === 'rename' ? this.nameField(node) : dialogProjectHistoryTitle(node);
    const kind = dialogProjectHistoryKind(
      node.name !== '' ? 'Named Snapshot \u00b7 Kept until you delete it' : 'Editing Session \u00b7 Unnamed',
    );
    const fields = dialogProjectHistoryFields(dialogProjectHistoryFacts(tree, node, state.now));
    const marker =
      node.id === tree.index.marker ? [dialogProjectHistoryNote(dialogProjectHistoryMarkerText(tree))] : [];
    return [thumb, caption, head, kind, fields, ...marker, this.noteField(node), this.actions(tree, node, state.mode)];
  }

  /**
   * Builds the name field.
   *
   * @param node Node.
   * @returns Field.
   */
  private nameField(node: ProjectHistoryNode): HTMLElement {
    const input = dialogProjectHistoryInput('Snapshot Name', node.name, PROJECT_HISTORY_NAME_MAX);
    input.dataset['historyFocus'] = 'true';
    input.style.fontSize = '14px';
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') this.events.rename(node, input.value);
      else if (event.key === 'Escape') this.events.focusTree();
      if (event.key === 'Enter' || event.key === 'Escape') event.preventDefault();
    });
    return input;
  }

  /**
   * Builds the note field; it saves when it loses focus.
   *
   * @param node Node.
   * @returns Labelled field.
   */
  private noteField(node: ProjectHistoryNode): HTMLElement {
    const label = document.createElement('label');
    Object.assign(label.style, {
      display: 'block',
      marginTop: '12px',
      fontSize: '12px',
      color: DIALOG_PROJECT_HISTORY_TEXT_MUTED,
    });
    label.textContent = 'Note';
    const area = dialogProjectHistoryNoteArea(node.note);
    area.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') this.events.focusTree();
    });
    area.addEventListener('change', () => this.events.note(node, area.value));
    label.append(area);
    return label;
  }

  /**
   * Builds the action buttons.
   *
   * @param tree Tree.
   * @param node Node.
   * @param mode Panel mode.
   * @returns Action block.
   */
  private actions(
    tree: DialogProjectHistoryTree,
    node: ProjectHistoryNode,
    mode: DialogProjectHistoryDetailMode,
  ): HTMLElement {
    const block = document.createElement('div');
    Object.assign(block.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' });
    if (mode === 'confirm-delete') block.append(...this.confirm(node));
    else block.append(...this.buttons(tree, node));
    for (const button of block.querySelectorAll('button'))
      Object.assign(button.style, { width: '100%', whiteSpace: 'nowrap', paddingLeft: '6px', paddingRight: '6px' });
    return block;
  }

  /**
   * Builds the normal actions.
   *
   * @param tree Tree.
   * @param node Node.
   * @returns Elements.
   */
  private buttons(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): HTMLElement[] {
    const restore = dialogCardButton('Restore', true, () => this.events.restore(node));
    restore.title =
      'Continues from this state. Nothing is overwritten: the work you leave stays at the end of its branch.';
    restore.setAttribute('aria-keyshortcuts', 'Enter');
    restore.style.gridColumn = '1 / -1';
    const copy = dialogCardButton('Open As Copy', false, () => this.events.copy(node));
    copy.title =
      tree.kind === 'room'
        ? 'Saves this state as a new level file in the project.'
        : 'Saves this state as a new level file and opens it.';
    const rename = dialogCardButton(node.name !== '' ? 'Rename' : 'Name And Keep', false, () =>
      this.events.renameStart(node),
    );
    rename.setAttribute('aria-keyshortcuts', 'F2');
    rename.title = node.name !== '' ? 'Renames this snapshot.' : 'Names this state so it is kept until you delete it.';
    const remove = dialogCardButton('Delete', false, () => this.events.remove(node));
    remove.setAttribute('aria-keyshortcuts', 'Delete');
    remove.title =
      projectHistoryTreeChildCount(tree.index, node.id) > 0
        ? 'Deletes this state; the states that grew from it attach to the one before.'
        : 'Deletes this state.';
    remove.style.color = DIALOG_PROJECT_HISTORY_DANGER_TEXT;
    const list = [restore, copy, rename];
    if (node.name !== '') list.push(dialogCardButton('Clear Name', false, () => this.events.rename(node, '')));
    list.push(remove);
    if (list.length % 2 === 0) remove.style.gridColumn = '1 / -1';
    return list;
  }

  /**
   * Builds the inline delete confirmation of a named snapshot.
   *
   * @param node Node.
   * @returns Elements.
   */
  private confirm(node: ProjectHistoryNode): HTMLElement[] {
    const ask = dialogProjectHistoryText(
      `Delete \u201c${node.name}\u201d? Named snapshots are kept until you delete them.`,
      DIALOG_PROJECT_HISTORY_TEXT_MAIN,
    );
    Object.assign(ask.style, { gridColumn: '1 / -1', whiteSpace: 'normal', fontSize: '12px', lineHeight: '1.45' });
    ask.setAttribute('role', 'alert');
    const yes = dialogCardButton('Delete Snapshot', false, () => this.events.remove(node));
    yes.style.color = DIALOG_PROJECT_HISTORY_DANGER_TEXT;
    yes.dataset['historyFocus'] = 'true';
    const no = dialogCardButton('Keep', false, () => this.events.focusTree());
    return [ask, yes, no];
  }
}

/**
 * Builds a node's title with its padlock.
 *
 * @param node Node.
 * @returns Title.
 */
function dialogProjectHistoryTitle(node: ProjectHistoryNode): HTMLElement {
  const title = document.createElement('div');
  Object.assign(title.style, { display: 'flex', alignItems: 'center', gap: '8px' });
  const name = dialogProjectHistoryText(dialogProjectHistoryNodeName(node), DIALOG_PROJECT_HISTORY_TEXT_MAIN);
  Object.assign(name.style, { fontSize: '15px', fontWeight: '650', whiteSpace: 'normal', overflowWrap: 'anywhere' });
  title.append(name);
  if (node.name !== '') title.append(dialogProjectHistoryLock());
  return title;
}

/**
 * Builds a secondary line.
 *
 * @param text Line.
 * @returns Element.
 */
function dialogProjectHistoryKind(text: string): HTMLElement {
  const kind = dialogProjectHistoryText(text, DIALOG_PROJECT_HISTORY_TEXT_SOFT);
  Object.assign(kind.style, { display: 'block', fontSize: '12px', margin: '3px 0 12px', whiteSpace: 'normal' });
  return kind;
}

/**
 * Words where a node's thumbnail came from.
 *
 * @param node Node.
 * @returns Caption.
 */
function dialogProjectHistoryCaption(node: ProjectHistoryNode): string {
  if (node.thumbnail === 'view') return 'Captured from the largest Perspective view';
  if (node.thumbnail === 'framed') return 'Whole level, framed (no Perspective view was open)';
  return 'No thumbnail';
}

/**
 * Lists the facts of a node.
 *
 * @param tree Tree.
 * @param node Node.
 * @param now Current time.
 * @returns Label, value and tooltip.
 */
function dialogProjectHistoryFacts(
  tree: DialogProjectHistoryTree,
  node: ProjectHistoryNode,
  now: number,
): Array<readonly [string, string, string?]> {
  const parent = projectHistoryNodeFind(tree.index, node.parent);
  const change = dialogProjectHistoryChange(tree.index, node);
  const facts: Array<readonly [string, string, string?]> = [
    ['Saved', dialogProjectHistoryAbsolute(node.time), timeRelativeText(node.time, now)],
    ['Objects', String(node.objectCount)],
    ['Changes', parent === null ? change : `${change} since ${dialogProjectHistoryNodeRef(parent)}`],
  ];
  if (node.autosaves > 1) facts.push(['Autosaves', `${node.autosaves} \u00b7 ${dialogProjectHistorySpan(node)}`]);
  const children = projectHistoryTreeChildCount(tree.index, node.id);
  if (children > 1) facts.push(['Branches', `${textCount(children, 'branch', 'branches')} grew from here`]);
  return facts;
}

/**
 * Words the note on the marker node.
 *
 * @param tree Tree.
 * @returns Note.
 */
function dialogProjectHistoryMarkerText(tree: DialogProjectHistoryTree): string {
  if (tree.current) return 'Your current work continues from this state.';
  return tree.kind === 'room' ? 'The room was left at this state.' : 'Opening this level continues from here.';
}

/**
 * Builds the note field; it grows with its text, so a long note scrolls with
 * the details pane instead of inside the field.
 *
 * @param note Note text.
 * @returns Text area.
 */
function dialogProjectHistoryNoteArea(note: string): HTMLTextAreaElement {
  const area = document.createElement('textarea');
  area.value = note;
  area.maxLength = PROJECT_HISTORY_NOTE_MAX;
  area.rows = 3;
  area.placeholder = 'What this state is for';
  Object.assign(area.style, dialogProjectHistoryFieldStyle(), {
    display: 'block',
    marginTop: '4px',
    resize: 'none',
    overflowY: 'hidden',
    borderColor: 'rgba(255,255,255,0.18)',
  });
  const grow = () => {
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  };
  area.addEventListener('input', grow);
  requestAnimationFrame(grow);
  return area;
}
