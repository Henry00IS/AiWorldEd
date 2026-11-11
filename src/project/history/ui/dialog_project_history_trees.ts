import { Theme } from '@/theme.js';
import { textCount } from '@/utils/utils_plural.js';
import { projectPathName, projectPathStem } from '@/project/fs/project_path.js';
import type { ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import {
  DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
  DIALOG_PROJECT_HISTORY_SELECTED,
  DIALOG_PROJECT_HISTORY_TEXT_MAIN,
  DIALOG_PROJECT_HISTORY_TEXT_MUTED,
  dialogProjectHistoryFocusRing,
  dialogProjectHistoryHeading,
  dialogProjectHistoryText,
  dialogProjectHistoryThumb,
} from './dialog_project_history_style.js';
import type { DialogProjectHistoryTree } from './dialog_project_history_types.js';

/** What the tree list reports back. */
export interface DialogProjectHistoryTreesEvents {
  /**
   * A tree was picked.
   *
   * @param tree Tree.
   */
  pick(tree: DialogProjectHistoryTree): void;
  /**
   * An item needs the thumbnail of its newest state.
   *
   * @param tree Tree.
   * @param node Newest node.
   * @param box Thumbnail box to fill.
   */
  thumbnail(tree: DialogProjectHistoryTree, node: ProjectHistoryNode, box: HTMLElement): void;
}

/**
 * Draws the list of levels and rooms that have a history.
 *
 * @param target Container to fill.
 * @param trees Trees.
 * @param active Id of the shown tree.
 * @param events List callbacks.
 */
export function dialogProjectHistoryTreesRender(
  target: HTMLElement,
  trees: readonly DialogProjectHistoryTree[],
  active: string,
  events: DialogProjectHistoryTreesEvents,
): void {
  const children: HTMLElement[] = [];
  for (const [kind, title] of [
    ['level', 'Levels'],
    ['room', 'Rooms'],
  ] as const) {
    const group = trees.filter((tree) => tree.kind === kind);
    if (group.length === 0 && kind === 'room') continue;
    const heading = dialogProjectHistoryHeading(title);
    heading.style.padding = '10px 8px 6px';
    const list = document.createElement('ul');
    list.setAttribute('aria-label', title);
    Object.assign(list.style, { listStyle: 'none', margin: '0', padding: '0' });
    for (const tree of group) list.append(dialogProjectHistoryTreeItem(tree, tree.id === active, events));
    children.push(heading, list);
  }
  target.replaceChildren(...children);
}

/**
 * Builds one list item.
 *
 * @param tree Tree.
 * @param active Whether it is shown.
 * @param events List callbacks.
 * @returns Item.
 */
function dialogProjectHistoryTreeItem(
  tree: DialogProjectHistoryTree,
  active: boolean,
  events: DialogProjectHistoryTreesEvents,
): HTMLElement {
  const item = document.createElement('li');
  const button = dialogProjectHistoryTreeButton(tree, active);
  button.addEventListener('click', () => events.pick(tree));
  const newest = [...tree.index.nodes].sort((left, right) => right.time - left.time)[0];
  const thumb = dialogProjectHistoryThumb(null, 40);
  if (newest !== undefined) events.thumbnail(tree, newest, thumb);
  button.append(thumb, dialogProjectHistoryTreeText(tree));
  item.append(button);
  return item;
}

/**
 * Builds the button of a list item.
 *
 * @param tree Tree.
 * @param active Whether it is shown.
 * @returns Button.
 */
function dialogProjectHistoryTreeButton(tree: DialogProjectHistoryTree, active: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['historyTreeId'] = tree.id;
  if (active) button.setAttribute('aria-current', 'true');
  Object.assign(button.style, {
    display: 'grid',
    gridTemplateColumns: '40px minmax(0, 1fr)',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    margin: '2px 0',
    padding: '6px',
    border: `1px solid ${active ? 'rgba(232,106,23,0.55)' : 'transparent'}`,
    borderRadius: '7px',
    background: active ? DIALOG_PROJECT_HISTORY_SELECTED : 'transparent',
    color: DIALOG_PROJECT_HISTORY_TEXT_MAIN,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: Theme.uiFontFamily,
  });
  dialogProjectHistoryFocusRing(button, 'none');
  return button;
}

/**
 * Builds the text of a list item.
 *
 * @param tree Tree.
 * @returns Text block.
 */
function dialogProjectHistoryTreeText(tree: DialogProjectHistoryTree): HTMLElement {
  const text = document.createElement('span');
  Object.assign(text.style, { display: 'block', minWidth: '0' });
  const label = tree.kind === 'level' ? projectPathStem(projectPathName(tree.label)) : tree.label;
  const name = dialogProjectHistoryText(label, DIALOG_PROJECT_HISTORY_TEXT_MAIN);
  Object.assign(name.style, { display: 'block', fontWeight: '600', fontSize: '12.5px' });
  name.title = tree.label;
  const named = tree.index.nodes.filter((node) => node.name !== '').length;
  const counts = `${textCount(tree.index.nodes.length, 'state')} \u00b7 ${named} named`;
  const meta = dialogProjectHistoryText(counts, DIALOG_PROJECT_HISTORY_TEXT_MUTED);
  Object.assign(meta.style, { display: 'block', fontSize: '11.5px', marginTop: '2px' });
  text.append(name, meta);
  if (!tree.current) return text;
  const open = dialogProjectHistoryText(
    tree.kind === 'room' ? 'Your Room' : 'Open Level',
    DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
  );
  Object.assign(open.style, { display: 'block', fontSize: '11.5px', fontWeight: '600', marginTop: '2px' });
  text.append(open);
  return text;
}
