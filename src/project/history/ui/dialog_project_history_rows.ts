import { timeRelativeText } from '@/utils/utils_time_relative.js';
import type { ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import {
  projectHistoryTreeLayout,
  type ProjectHistoryTreeRow,
} from '@/project/history/tree/project_history_tree_layout.js';
import { dialogProjectHistoryGraph, type DialogProjectHistoryPoint } from './dialog_project_history_graph.js';
import {
  DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
  DIALOG_PROJECT_HISTORY_SELECTED,
  DIALOG_PROJECT_HISTORY_TEXT_MAIN,
  DIALOG_PROJECT_HISTORY_TEXT_MUTED,
  DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  dialogProjectHistoryFocusRing,
  dialogProjectHistoryHeading,
  dialogProjectHistoryHereThumb,
  dialogProjectHistoryLock,
  dialogProjectHistoryText,
  dialogProjectHistoryThumb,
} from './dialog_project_history_style.js';
import {
  dialogProjectHistoryAbsolute,
  dialogProjectHistoryClock,
  dialogProjectHistoryDay,
  dialogProjectHistoryNodeLine,
  dialogProjectHistoryNodeName,
} from './dialog_project_history_text.js';
import type { DialogProjectHistoryTree } from './dialog_project_history_types.js';

/** Height of a state row. */
const DIALOG_PROJECT_HISTORY_ROW_HEIGHT = 64;
/** Height of a day heading. */
const DIALOG_PROJECT_HISTORY_DAY_HEIGHT = 30;
/** Width of one graph lane. */
const DIALOG_PROJECT_HISTORY_LANE_WIDTH = 20;

/** What the rows report back. */
export interface DialogProjectHistoryRowsEvents {
  /**
   * A row was clicked.
   *
   * @param id Row id.
   */
  select(id: string): void;
  /**
   * A saved state was double-clicked.
   *
   * @param node Node.
   */
  restore(node: ProjectHistoryNode): void;
  /**
   * A row needs its thumbnail.
   *
   * @param node Node.
   * @param box Thumbnail box to fill.
   */
  thumbnail(node: ProjectHistoryNode, box: HTMLElement): void;
}

/** Rows of one tree, newest first, drawn over the branch graph. */
export class DialogProjectHistoryRows {
  private readonly events: DialogProjectHistoryRowsEvents;
  private readonly centers = new Map<string, DialogProjectHistoryPoint>();
  private order: string[] = [];

  /**
   * Creates the row renderer.
   *
   * @param events Row callbacks.
   */
  constructor(events: DialogProjectHistoryRowsEvents) {
    this.events = events;
  }

  /**
   * Row ids in display order.
   *
   * @returns Ids, newest first.
   */
  ids(): readonly string[] {
    return this.order;
  }

  /**
   * Vertical center of a row.
   *
   * @param id Row id.
   * @returns Pixels from the top, or null when not drawn.
   */
  center(id: string): number | null {
    return this.centers.get(id)?.y ?? null;
  }

  /**
   * Draws a tree into a container.
   *
   * @param target Container to fill.
   * @param tree Tree.
   * @param selected Selected row id.
   * @param now Current time.
   */
  render(target: HTMLElement, tree: DialogProjectHistoryTree, selected: string, now: number): void {
    const layout = projectHistoryTreeLayout(tree.index, tree.current);
    const graphWidth = 14 + layout.lanes * DIALOG_PROJECT_HISTORY_LANE_WIDTH;
    const inner = document.createElement('div');
    inner.style.position = 'relative';
    this.centers.clear();
    this.order = [];
    let y = 0;
    let day = '';
    for (const row of layout.rows) {
      const label = dialogProjectHistoryDay(row.node?.time ?? now, now);
      if (label !== day) y += this.dayAppend(inner, (day = label), graphWidth);
      this.centers.set(row.id, { x: 10 + row.lane * DIALOG_PROJECT_HISTORY_LANE_WIDTH + 7, y: y + 32 });
      inner.append(this.row(tree, row, row.id === selected, [graphWidth, now]));
      this.order.push(row.id);
      y += DIALOG_PROJECT_HISTORY_ROW_HEIGHT;
    }
    inner.style.height = `${y + 8}px`;
    inner.prepend(dialogProjectHistoryGraph(layout.rows, this.centers, tree.index.marker, { x: graphWidth, y: y + 8 }));
    target.replaceChildren(layout.rows.length === 0 ? dialogProjectHistoryRowsEmpty() : inner);
  }

  /**
   * Appends a day heading.
   *
   * @param inner Row container.
   * @param label Day label.
   * @param graphWidth Width reserved for the graph.
   * @returns Height added.
   */
  private dayAppend(inner: HTMLElement, label: string, graphWidth: number): number {
    const heading = dialogProjectHistoryHeading(label);
    heading.setAttribute('role', 'presentation');
    Object.assign(heading.style, {
      height: `${DIALOG_PROJECT_HISTORY_DAY_HEIGHT}px`,
      lineHeight: `${DIALOG_PROJECT_HISTORY_DAY_HEIGHT}px`,
      paddingLeft: `${graphWidth + 8}px`,
      position: 'relative',
      zIndex: '1',
    });
    inner.append(heading);
    return DIALOG_PROJECT_HISTORY_DAY_HEIGHT;
  }

  /**
   * Builds one row.
   *
   * @param tree Tree.
   * @param row Placed row.
   * @param selected Whether it is selected.
   * @param frame Graph width and current time.
   * @returns Row element.
   */
  private row(
    tree: DialogProjectHistoryTree,
    row: ProjectHistoryTreeRow,
    selected: boolean,
    frame: readonly [number, number],
  ): HTMLElement {
    const item = dialogProjectHistoryRowFrame(row.id, selected, frame[0]);
    const node = row.node;
    item.addEventListener('click', () => this.events.select(row.id));
    item.addEventListener('dblclick', () => node !== null && this.events.restore(node));
    const thumb = node === null ? dialogProjectHistoryHereThumb(false) : dialogProjectHistoryThumb(null, 52);
    if (node !== null) this.events.thumbnail(node, thumb);
    const text = node === null ? dialogProjectHistoryHereText(tree) : dialogProjectHistoryNodeText(tree, node);
    item.setAttribute('aria-label', dialogProjectHistoryRowLabel(tree, node));
    item.append(document.createElement('span'), thumb, text, dialogProjectHistoryRowTime(node, frame[1]));
    return item;
  }
}

/**
 * Builds the frame of a row.
 *
 * @param id Row id.
 * @param selected Whether it is selected.
 * @param graphWidth Width reserved for the graph.
 * @returns Row element.
 */
function dialogProjectHistoryRowFrame(id: string, selected: boolean, graphWidth: number): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-selected', String(selected));
  item.tabIndex = selected ? 0 : -1;
  item.dataset['historyNode'] = id;
  Object.assign(item.style, {
    position: 'relative',
    zIndex: '1',
    height: `${DIALOG_PROJECT_HISTORY_ROW_HEIGHT}px`,
    display: 'grid',
    gridTemplateColumns: `${graphWidth}px 52px minmax(0, 1fr) auto`,
    alignItems: 'center',
    columnGap: '10px',
    paddingRight: '10px',
    cursor: 'pointer',
    background: selected ? DIALOG_PROJECT_HISTORY_SELECTED : 'transparent',
    borderRadius: '6px',
  });
  dialogProjectHistoryFocusRing(item, selected ? 'inset 0 0 0 1px rgba(232,106,23,0.55)' : 'none');
  return item;
}

/**
 * Builds the text of the "You Are Here" row.
 *
 * @param tree Current tree.
 * @returns Text block.
 */
function dialogProjectHistoryHereText(tree: DialogProjectHistoryTree): HTMLElement {
  const name = dialogProjectHistoryText('You Are Here', DIALOG_PROJECT_HISTORY_ACCENT_TEXT);
  Object.assign(name.style, { fontWeight: '700', fontSize: '13px' });
  const line = tree.pending ? 'Unsaved changes' : 'No changes since the last save';
  return dialogProjectHistoryRowText([name], line, DIALOG_PROJECT_HISTORY_TEXT_SOFT);
}

/**
 * Builds the text of a saved state's row.
 *
 * @param tree Tree.
 * @param node Node.
 * @returns Text block.
 */
function dialogProjectHistoryNodeText(tree: DialogProjectHistoryTree, node: ProjectHistoryNode): HTMLElement {
  const name = dialogProjectHistoryText(dialogProjectHistoryNodeName(node), DIALOG_PROJECT_HISTORY_TEXT_MAIN);
  Object.assign(name.style, { fontWeight: node.name !== '' ? '650' : '500', fontSize: '13px' });
  const title: HTMLElement[] = [name];
  if (node.name !== '') title.push(dialogProjectHistoryLock());
  if (node.id === tree.index.marker) {
    const here = dialogProjectHistoryText(
      tree.current ? 'Current Branch' : 'Last Worked On',
      DIALOG_PROJECT_HISTORY_ACCENT_TEXT,
    );
    Object.assign(here.style, { fontSize: '11px', fontWeight: '600', flex: 'none' });
    title.push(here);
  }
  return dialogProjectHistoryRowText(
    title,
    dialogProjectHistoryNodeLine(tree.index, node),
    DIALOG_PROJECT_HISTORY_TEXT_MUTED,
  );
}

/**
 * Builds a row's two text lines.
 *
 * @param title Elements of the first line.
 * @param line Second line.
 * @param color Color of the second line.
 * @returns Text block.
 */
function dialogProjectHistoryRowText(title: readonly HTMLElement[], line: string, color: string): HTMLElement {
  const text = document.createElement('div');
  text.style.minWidth = '0';
  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0' });
  head.append(...title);
  const sub = dialogProjectHistoryText(line, color);
  Object.assign(sub.style, { display: 'block', fontSize: '12px', marginTop: '3px' });
  text.append(head, sub);
  return text;
}

/**
 * Builds a row's time.
 *
 * @param node Node, or null for "You Are Here".
 * @param now Current time.
 * @returns Time element.
 */
function dialogProjectHistoryRowTime(node: ProjectHistoryNode | null, now: number): HTMLElement {
  const color = node === null ? DIALOG_PROJECT_HISTORY_ACCENT_TEXT : DIALOG_PROJECT_HISTORY_TEXT_SOFT;
  const time = dialogProjectHistoryText(node === null ? 'Now' : dialogProjectHistoryClock(node.time), color);
  Object.assign(time.style, { fontVariantNumeric: 'tabular-nums', fontSize: '12px' });
  if (node !== null)
    time.title = `${dialogProjectHistoryAbsolute(node.time)} \u00b7 ${timeRelativeText(node.time, now)}`;
  return time;
}

/**
 * Words a row for screen readers.
 *
 * @param tree Tree.
 * @param node Node, or null for "You Are Here".
 * @returns Label.
 */
function dialogProjectHistoryRowLabel(tree: DialogProjectHistoryTree, node: ProjectHistoryNode | null): string {
  if (node === null) return `You Are Here, ${tree.pending ? 'unsaved changes' : 'no unsaved changes'}`;
  const parts = [dialogProjectHistoryNodeName(node), node.name !== '' ? 'named snapshot, locked' : 'editing session'];
  if (node.id === tree.index.marker) parts.push(tree.current ? 'current branch' : 'last worked on');
  parts.push(dialogProjectHistoryAbsolute(node.time), dialogProjectHistoryNodeLine(tree.index, node));
  return parts.join(', ');
}

/**
 * Builds the text shown when a tree has nothing saved yet.
 *
 * @returns Element.
 */
function dialogProjectHistoryRowsEmpty(): HTMLElement {
  const empty = dialogProjectHistoryText(
    'Nothing saved yet. Autosaves appear here as you edit.',
    DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  );
  Object.assign(empty.style, { display: 'block', padding: '16px', whiteSpace: 'normal' });
  return empty;
}
