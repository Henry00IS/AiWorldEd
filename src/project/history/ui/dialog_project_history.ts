import { dialogCardStyle, dialogCardTitle } from '@/ui/dialog/dialog_card.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { projectHistoryNodeFind, type ProjectHistoryNode } from '@/project/history/tree/project_history_tree.js';
import { PROJECT_HISTORY_HERE } from '@/project/history/tree/project_history_tree_layout.js';
import { DialogProjectHistoryDetail, type DialogProjectHistoryDetailMode } from './dialog_project_history_detail.js';
import { DialogProjectHistoryFooter } from './dialog_project_history_footer.js';
import { dialogProjectHistoryKeyTarget } from './dialog_project_history_keys.js';
import { DialogProjectHistoryRows } from './dialog_project_history_rows.js';
import {
  DIALOG_PROJECT_HISTORY_TEXT_SOFT,
  dialogProjectHistoryPane,
  dialogProjectHistoryText,
  type DialogProjectHistoryPane,
} from './dialog_project_history_style.js';
import { dialogProjectHistoryIntro } from './dialog_project_history_text.js';
import { dialogProjectHistoryTreesRender } from './dialog_project_history_trees.js';
import type {
  DialogProjectHistoryResult,
  DialogProjectHistorySource,
  DialogProjectHistoryTree,
} from './dialog_project_history_types.js';

/**
 * Level History: one tree of read-only saved states per level and per room,
 * newest first, with the details of the selected state beside it. Clicking a
 * row only selects it; Restore or a double-click continues from it.
 */
export class DialogProjectHistory extends PanelFloating {
  private readonly source: DialogProjectHistorySource;
  private readonly panes: Record<'trees' | 'rows' | 'detail', DialogProjectHistoryPane>;
  private readonly rows: DialogProjectHistoryRows;
  private readonly detail: DialogProjectHistoryDetail;
  private readonly footer: DialogProjectHistoryFooter;
  private trees: DialogProjectHistoryTree[] = [];
  private treeId = '';
  private selected = PROJECT_HISTORY_HERE;
  private mode: DialogProjectHistoryDetailMode = 'view';
  private busy = false;
  private resolver: (() => void) | null = null;
  /**
   * Tree and row the detail panel last showed, so a redraw of it keeps its
   * scroll.
   */
  private detailShown = '';

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param source States and actions.
   */
  constructor(host: HTMLElement, source: DialogProjectHistorySource) {
    super(host, {
      corner: 'top-left',
      modal: true,
      centered: true,
      draggable: false,
      closeOnEscape: true,
      closeOnBackdropClick: false,
      stackLayer: 'modal',
      backdropClassName: 'editor-message-box-backdrop',
    });
    this.source = source;
    this.panes = {
      trees: dialogProjectHistoryPane('4px 8px 8px'),
      rows: dialogProjectHistoryPane('0 0 4px'),
      detail: dialogProjectHistoryPane('14px 16px'),
    };
    this.rows = new DialogProjectHistoryRows({
      select: (id) => this.select(id),
      restore: (node) => void this.restore(node),
      thumbnail: (node, box) => this.thumbnail(this.tree(), node, box),
    });
    this.detail = new DialogProjectHistoryDetail({
      restore: (node) => void this.restore(node),
      copy: (node) => void this.act((tree) => this.source.copy(tree, node)),
      renameStart: () => this.modeSet('rename'),
      rename: (node, name) => void this.act((tree) => this.source.rename(tree, node, name)),
      note: (node, note) => void this.act((tree) => this.source.note(tree, node, note), false),
      remove: (node) => this.remove(node),
      thumbnail: (node, box) => this.thumbnail(this.tree(), node, box),
      focusTree: () => this.modeSet('view'),
    });
    this.footer = new DialogProjectHistoryFooter({
      take: (name) => void this.act((tree) => this.source.take(tree, name)),
      close: () => this.finish(),
    });
    this.build();
  }

  /**
   * Shows the dialog.
   *
   * @returns Resolves when closed.
   */
  open(): Promise<void> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.show();
      void this.refresh().then(() => this.focusSelected());
    });
  }

  /** Builds the card. */
  private build(): void {
    dialogCardStyle(this.root, 'min(1180px, calc(100vw - 32px))', 'project-history-title');
    this.root.dataset['projectHistory'] = 'tree';
    this.root.addEventListener('keydown', (event) => this.keyDown(event));
    const intro = dialogProjectHistoryText(
      dialogProjectHistoryIntro(this.source.projectName()),
      DIALOG_PROJECT_HISTORY_TEXT_SOFT,
    );
    Object.assign(intro.style, {
      display: 'block',
      whiteSpace: 'normal',
      lineHeight: '1.5',
      margin: '-6px 0 14px',
      fontSize: '12.5px',
    });
    const body = document.createElement('div');
    Object.assign(body.style, {
      display: 'grid',
      gridTemplateColumns: '220px minmax(0, 1fr) 300px',
      gap: '12px',
      height: 'min(640px, calc(100vh - 240px))',
      minHeight: '320px',
    });
    this.panes.trees.host.setAttribute('aria-label', 'Levels And Rooms');
    this.panes.rows.content.setAttribute('role', 'tree');
    this.panes.rows.content.setAttribute('aria-label', 'Saved States, Newest First');
    this.panes.rows.content.dataset['historyTree'] = 'true';
    this.panes.detail.content.dataset['historyDetail'] = 'true';
    this.panes.detail.content.setAttribute('aria-live', 'polite');
    body.append(this.panes.trees.host, this.panes.rows.host, this.panes.detail.host);
    this.root.append(dialogCardTitle('project-history-title', 'Level History'), intro, body, this.footer.element);
  }

  /** Reads the trees again and redraws. */
  private async refresh(): Promise<void> {
    this.trees = await this.source.trees();
    const tree = this.trees.find((entry) => entry.id === this.treeId) ?? this.trees[0] ?? null;
    if (tree !== null && tree.id !== this.treeId) {
      this.treeId = tree.id;
      this.selected = this.selectionDefault(tree);
    }
    if (
      tree !== null &&
      this.selected !== PROJECT_HISTORY_HERE &&
      projectHistoryNodeFind(tree.index, this.selected) === null
    )
      this.selected = this.selectionDefault(tree);
    this.render();
  }

  /**
   * Row selected when a tree is shown: "You Are Here" for live work, else the
   * state it was left at.
   *
   * @param tree Tree.
   * @returns Row id.
   */
  private selectionDefault(tree: DialogProjectHistoryTree): string {
    if (tree.current) return PROJECT_HISTORY_HERE;
    return tree.index.marker ?? tree.index.nodes.at(-1)?.id ?? PROJECT_HISTORY_HERE;
  }

  /**
   * Shown tree.
   *
   * @returns Tree, or null when there is none.
   */
  private tree(): DialogProjectHistoryTree | null {
    return this.trees.find((tree) => tree.id === this.treeId) ?? null;
  }

  /**
   * Selected saved state.
   *
   * @returns Node, or null for "You Are Here".
   */
  private node(): ProjectHistoryNode | null {
    const tree = this.tree();
    return tree === null ? null : projectHistoryNodeFind(tree.index, this.selected);
  }

  /** Redraws the three panes and the footer. */
  private render(): void {
    const tree = this.tree();
    dialogProjectHistoryTreesRender(this.panes.trees.content, this.trees, this.treeId, {
      pick: (picked) => this.pick(picked),
      thumbnail: (owner, node, box) => this.thumbnail(owner, node, box),
    });
    if (tree === null) this.panes.rows.content.replaceChildren();
    else this.rows.render(this.panes.rows.content, tree, this.selected, this.source.now());
    this.renderDetail();
    this.footer.update(this.trees, tree);
    this.panes.trees.sync();
    this.panes.rows.sync();
    this.scrollToSelected();
  }

  /** Redraws the detail panel. */
  private renderDetail(): void {
    const tree = this.tree();
    if (tree === null) this.panes.detail.content.replaceChildren();
    else this.detail.render(this.panes.detail.content, tree, this.node(), { mode: this.mode, now: this.source.now() });
    const shown = `${this.treeId}\n${this.selected}`;
    if (shown !== this.detailShown) this.panes.detail.scroller.scrollTop = 0;
    this.detailShown = shown;
    this.panes.detail.sync();
    if (this.mode !== 'view') this.detail.focusField();
  }

  /**
   * Shows another tree.
   *
   * @param tree Tree.
   */
  private pick(tree: DialogProjectHistoryTree): void {
    this.treeId = tree.id;
    this.selected = this.selectionDefault(tree);
    this.mode = 'view';
    this.render();
  }

  /**
   * Selects a row; it never loads anything.
   *
   * @param id Row id.
   */
  private select(id: string): void {
    this.selected = id;
    this.mode = 'view';
    this.render();
    this.focusSelected();
  }

  /**
   * Switches the detail panel mode, redrawing it only when the mode changes;
   * back to view returns focus to the tree.
   *
   * @param mode Mode.
   */
  private modeSet(mode: DialogProjectHistoryDetailMode): void {
    if (mode !== this.mode) {
      this.mode = mode;
      this.renderDetail();
    }
    if (mode === 'view') this.focusSelected();
  }

  /**
   * Restores a state straight away and selects "You Are Here".
   *
   * @param node Node.
   */
  private async restore(node: ProjectHistoryNode): Promise<void> {
    await this.act((tree) => this.source.restore(tree, node));
  }

  /**
   * Deletes a state: an unnamed one straight away, a named one after the inline
   * confirmation.
   *
   * @param node Node.
   */
  private remove(node: ProjectHistoryNode): void {
    if (node.name !== '' && this.mode !== 'confirm-delete') return this.modeSet('confirm-delete');
    void this.act((tree) => this.source.remove(tree, node));
  }

  /**
   * Runs an action on the shown tree, then shows its outcome.
   *
   * @param run Action.
   * @param focus Whether to focus the selected row afterwards.
   */
  private async act(
    run: (tree: DialogProjectHistoryTree) => Promise<DialogProjectHistoryResult>,
    focus = true,
  ): Promise<void> {
    const tree = this.tree();
    if (tree === null || this.busy) return;
    this.busy = true;
    try {
      const result = await run(tree);
      if (result.select !== undefined) this.selected = result.select;
      this.mode = 'view';
      this.footer.status(result.message);
      await this.refresh();
    } finally {
      this.busy = false;
    }
    if (focus) this.focusSelected();
  }

  /**
   * Fills a thumbnail box once its image is loaded.
   *
   * @param tree Tree of the node.
   * @param node Node.
   * @param box Box.
   */
  private thumbnail(tree: DialogProjectHistoryTree | null, node: ProjectHistoryNode, box: HTMLElement): void {
    if (tree === null || node.thumbnail === null) return;
    void this.source.thumbnail(tree, node).then((url) => {
      if (url !== null) box.style.background = `#232323 center / cover no-repeat url("${url}")`;
    });
  }

  /** Scrolls the selected row into the middle of the tree pane when hidden. */
  private scrollToSelected(): void {
    const center = this.rows.center(this.selected);
    const scroller = this.panes.rows.scroller;
    if (
      center === null ||
      (center > scroller.scrollTop + 40 && center < scroller.scrollTop + scroller.clientHeight - 40)
    )
      return;
    scroller.scrollTop = Math.max(0, center - scroller.clientHeight / 2);
  }

  /** Moves keyboard focus to the selected row. */
  private focusSelected(): void {
    const row = this.panes.rows.content.querySelector<HTMLElement>(
      `[data-history-node="${CSS.escape(this.selected)}"]`,
    );
    row?.focus({ preventScroll: true });
  }

  /**
   * Keyboard: arrows move through the tree, Enter restores, F2 renames, Delete
   * deletes; Escape leaves renaming or confirming, else closes.
   *
   * @param event Key event.
   */
  private keyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.mode !== 'view') this.modeSet('view');
      else this.finish();
      return;
    }
    const tree = this.tree();
    if (tree === null || !(event.target instanceof HTMLElement) || event.target.dataset['historyNode'] === undefined)
      return;
    const action = dialogProjectHistoryKeyTarget(event.key, tree, this.rows.ids(), this.selected);
    if (action === null) return;
    event.preventDefault();
    const node = this.node();
    if (action.kind === 'select') this.select(action.id);
    else if (node === null) return;
    else if (action.kind === 'restore') void this.restore(node);
    else if (action.kind === 'rename') this.modeSet('rename');
    else this.remove(node);
  }

  /** Closes the dialog and frees its thumbnails. */
  private finish(): void {
    const resolver = this.resolver;
    this.resolver = null;
    for (const pane of Object.values(this.panes)) pane.dispose();
    this.source.release();
    this.dispose();
    resolver?.();
  }

  /** Answers when closed with Escape from outside the card. */
  protected override onAfterHide(): void {
    if (this.resolver !== null) queueMicrotask(() => this.finish());
  }
}
