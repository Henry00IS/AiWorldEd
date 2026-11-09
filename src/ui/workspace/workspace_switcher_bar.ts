import { Theme } from '@/theme.js';
import type { WorkspaceDefinition } from '@/layout/workspace/workspace_definition.js';
import { createDefaultWorkspaces } from '@/layout/workspace/workspace_definition.js';
import { InputInlineRename } from '@/ui/input/input_inline_rename.js';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import type { ToolbarMenuEntry } from '@/ui/menu/menu_types.js';
import { workspaceSwitcherResolveTabDropTargetAtClientX } from './workspace_switcher_bar_tabs.js';

/** Callbacks for workspace switcher actions. */
export interface WorkspaceSwitcherBarActions {
  /**
   * Switches to a workspace by id.
   *
   * @param workspaceId Target workspace id.
   */
  onSelectWorkspace(workspaceId: string): void;

  /**
   * Adds a new workspace tab from a default layout template.
   *
   * @param template Default workspace definition (name + layout).
   */
  onAddPresetWorkspace(template: WorkspaceDefinition): void;

  /** Duplicates the current layout as a new workspace tab. */
  onDuplicateCurrent(): void;

  /**
   * Deletes the given workspace when allowed.
   *
   * @param workspaceId Target workspace id.
   */
  onDeleteWorkspace(workspaceId: string): void;

  /**
   * Renames a workspace tab in persistence only (bar updates the label itself).
   *
   * @param workspaceId Target workspace id.
   * @param name New display name.
   */
  onRenameWorkspace(workspaceId: string, name: string): void;

  /**
   * Moves a workspace tab to a new index in the tab strip.
   *
   * @param workspaceId Workspace being dragged.
   * @param toIndex Destination index after reorder.
   */
  onReorderWorkspace(workspaceId: string, toIndex: number): void;
}

/**
 * Thin tab bar for switching named area workspaces, with a + menu for adding
 * presets or duplicating the current layout.
 */
export class WorkspaceSwitcherBar {
  private readonly root: HTMLElement;
  private readonly tabsHost: HTMLElement;
  private readonly addButton: HTMLButtonElement;
  private readonly insertIndicator: HTMLElement;
  private readonly actions: WorkspaceSwitcherBarActions;
  private readonly addMenuPanel: PanelMenu;
  private readonly onDocumentPointerDown: (event: PointerEvent) => void;
  private readonly onDocumentDragOver: (event: DragEvent) => void;
  private workspaces: readonly WorkspaceDefinition[];
  private activeId: string;
  private isAddMenuOpen: boolean;
  private activeRename: InputInlineRename | null;
  private dragWorkspaceId: string | null;

  /**
   * Creates the switcher bar under a parent element.
   *
   * @param parent Parent element (typically above the viewport host).
   * @param actions User action callbacks.
   */
  constructor(parent: HTMLElement, actions: WorkspaceSwitcherBarActions) {
    this.actions = actions;
    this.workspaces = [];
    this.activeId = '';
    this.isAddMenuOpen = false;
    this.activeRename = null;
    this.dragWorkspaceId = null;
    this.root = this.createRoot();
    this.tabsHost = this.createTabsHost();
    this.insertIndicator = this.createInsertIndicator();
    this.addButton = this.createAddButton();
    this.addMenuPanel = new PanelMenu(this.buildAddMenuEntries(), () => this.closeAddMenu());
    this.root.appendChild(this.tabsHost);
    this.root.appendChild(this.addButton);
    this.root.appendChild(this.insertIndicator);
    this.root.appendChild(this.addMenuPanel.getElement());
    this.onDocumentPointerDown = (event) => this.handleDocumentPointerDown(event);
    this.onDocumentDragOver = (event) => this.handleDocumentDragOver(event);
    document.addEventListener('pointerdown', this.onDocumentPointerDown);
    this.bindTabsHostDropTarget();
    parent.appendChild(this.root);
  }

  /**
   * Updates tabs from the workspace list. Rebuilds only when membership or
   * order changes; otherwise patches labels and active styles in place so
   * rename/select do not destroy DOM mid-interaction.
   *
   * @param workspaces Available workspaces.
   * @param activeId Active workspace id.
   */
  setWorkspaces(workspaces: readonly WorkspaceDefinition[], activeId: string): void {
    const previousIds = this.workspaces.map((item) => item.id);
    const nextIds = workspaces.map((item) => item.id);
    this.workspaces = workspaces;
    this.activeId = activeId;
    if (this.canPatchTabs(previousIds, nextIds)) {
      this.patchTabsInPlace(workspaces, activeId);
      return;
    }
    this.rebuildTabs();
  }

  /**
   * Returns the root element.
   *
   * @returns Root bar element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /**
   * Returns the add (+) button for tests.
   *
   * @returns Add menu trigger button.
   */
  getAddButton(): HTMLButtonElement {
    return this.addButton;
  }

  /**
   * Returns the add menu panel for tests.
   *
   * @returns Menu panel instance.
   */
  getAddMenuPanel(): PanelMenu {
    return this.addMenuPanel;
  }

  /**
   * Returns the tab button for a workspace id when present (tests).
   *
   * @param workspaceId Workspace id.
   * @returns Tab button or null.
   */
  getTabButton(workspaceId: string): HTMLButtonElement | null {
    const tabs = Array.from(this.tabsHost.querySelectorAll('button[data-workspace-id]'));
    const tab = tabs.find((element) => element.getAttribute('data-workspace-id') === workspaceId);
    return tab instanceof HTMLButtonElement ? tab : null;
  }

  /** Removes the bar from the DOM and unbinds listeners. */
  dispose(): void {
    this.disposeActiveRename();
    this.closeAddMenu();
    this.endTabDragSession();
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    this.root.remove();
  }

  /**
   * Creates the bar root element.
   *
   * @returns Root element.
   */
  private createRoot(): HTMLElement {
    const root = document.createElement('div');
    root.classList.add('editor-workspace-switcher');
    root.style.display = 'flex';
    root.style.alignItems = 'stretch';
    root.style.justifyContent = 'flex-start';
    root.style.gap = '2px';
    root.style.padding = '2px 4px';
    root.style.background = `#${Theme.toolbarBackground.toString(16).padStart(6, '0')}`;
    root.style.borderBottom = `1px solid #${Theme.separatorColor.toString(16).padStart(6, '0')}`;
    root.style.minHeight = '26px';
    root.style.flexShrink = '0';
    root.style.position = 'relative';
    return root;
  }

  /**
   * Creates the scrollable tabs host.
   *
   * @returns Tabs host element.
   */
  private createTabsHost(): HTMLElement {
    const host = document.createElement('div');
    host.style.display = 'flex';
    host.style.flex = '0 1 auto';
    host.style.gap = '0';
    host.style.overflowX = 'auto';
    host.style.minWidth = '0';
    host.style.maxWidth = '100%';
    host.style.position = 'relative';
    return host;
  }

  /**
   * Creates the orange insertion marker shown while dragging tabs.
   *
   * @returns Indicator element (hidden until drag-over).
   */
  private createInsertIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.classList.add('editor-workspace-tab-insert-indicator');
    indicator.style.position = 'absolute';
    indicator.style.top = '0';
    indicator.style.width = '3px';
    indicator.style.height = '100%';
    indicator.style.background = `#${Theme.selectionColor.toString(16).padStart(6, '0')}`;
    indicator.style.borderRadius = '1px';
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '20';
    indicator.style.display = 'none';
    indicator.style.boxShadow = `0 0 0 1px #${Theme.selectionColor.toString(16).padStart(6, '0')}`;
    indicator.style.transform = 'translateX(-50%)';
    return indicator;
  }

  /**
   * Accepts drag-over across the entire tab strip so the browser never flashes
   * the forbidden cursor over inter-tab margins.
   */
  private bindTabsHostDropTarget(): void {
    this.tabsHost.addEventListener('dragover', (event) => this.handleTabsHostDragOver(event));
    this.tabsHost.addEventListener('dragleave', (event) => this.handleTabsHostDragLeave(event));
    this.tabsHost.addEventListener('drop', (event) => this.handleTabsHostDrop(event));
  }

  /**
   * Updates the insert indicator while dragging over the tab strip.
   *
   * @param event Drag-over event on the tabs host.
   */
  private handleTabsHostDragOver(event: DragEvent): void {
    if (!this.dragWorkspaceId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const hit = this.resolveTabDropTargetAtClientX(event.clientX);
    if (!hit) {
      this.showInsertIndicatorAtEnd();
      return;
    }
    if (hit.workspaceId === this.dragWorkspaceId) {
      this.hideInsertIndicator();
      return;
    }
    this.showInsertIndicatorForTarget(hit.tab, hit.workspaceId);
  }

  /**
   * Hides the insert indicator when the pointer leaves the tab strip.
   *
   * @param event Drag-leave event on the tabs host.
   */
  private handleTabsHostDragLeave(event: DragEvent): void {
    const related = event.relatedTarget;
    if (related instanceof Node && this.tabsHost.contains(related)) return;
    this.hideInsertIndicator();
  }

  /**
   * Completes a reorder when the user drops on the tab strip.
   *
   * @param event Drop event on the tabs host.
   */
  private handleTabsHostDrop(event: DragEvent): void {
    if (!this.dragWorkspaceId) return;
    event.preventDefault();
    const sourceId = this.dragWorkspaceId;
    const hit = this.resolveTabDropTargetAtClientX(event.clientX);
    this.endTabDragSession();
    if (!hit || hit.workspaceId === sourceId) return;
    const targetIndex = this.workspaces.findIndex((item) => item.id === hit.workspaceId);
    if (targetIndex < 0) return;
    this.finishTabReorder(sourceId, targetIndex);
  }

  /**
   * Finds the tab under or nearest to a client X (covers flex gaps between
   * tabs).
   *
   * @param clientX Pointer X in viewport coordinates.
   * @returns Hit tab and id, or null when the strip is empty.
   */
  private resolveTabDropTargetAtClientX(clientX: number): { tab: HTMLButtonElement; workspaceId: string } | null {
    return workspaceSwitcherResolveTabDropTargetAtClientX(this.tabsHost, clientX);
  }

  /**
   * Creates the add-workspace (+) button that opens the preset menu.
   *
   * @returns Button element.
   */
  private createAddButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '+';
    button.title = 'Add workspace';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.style.border = 'none';
    button.style.background = 'transparent';
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.style.padding = '0 8px';
    button.style.fontSize = '16px';
    button.style.lineHeight = '1';
    button.style.flex = '0 0 auto';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleAddMenu();
    });
    return button;
  }

  /**
   * Builds declarative entries for the + menu.
   *
   * @returns Menu entries for presets and duplicate.
   */
  private buildAddMenuEntries(): ToolbarMenuEntry[] {
    const presets = createDefaultWorkspaces();
    const entries: ToolbarMenuEntry[] = presets.map((template) => ({
      kind: 'action' as const,
      label: template.name,
      onClick: () => this.actions.onAddPresetWorkspace(template),
    }));
    entries.push({ kind: 'separator' });
    entries.push({
      kind: 'action',
      label: 'Duplicate Current',
      tooltip: 'Add a new workspace.',
      onClick: () => this.actions.onDuplicateCurrent(),
    });
    return entries;
  }

  /** Opens or closes the add-workspace menu. */
  private toggleAddMenu(): void {
    if (this.isAddMenuOpen) {
      this.closeAddMenu();
      return;
    }
    this.openAddMenu();
  }

  /** Opens the add-workspace menu under the + button. */
  private openAddMenu(): void {
    this.addMenuPanel.open(this.addButton);
    this.isAddMenuOpen = true;
    this.addButton.setAttribute('aria-expanded', 'true');
  }

  /** Closes the add-workspace menu when open. */
  private closeAddMenu(): void {
    if (!this.isAddMenuOpen && !this.addMenuPanel.isOpen()) return;
    this.addMenuPanel.close();
    this.isAddMenuOpen = false;
    this.addButton.setAttribute('aria-expanded', 'false');
  }

  /**
   * Closes the add menu when the pointer lands outside the bar and menu.
   *
   * @param event Document pointer down event.
   */
  private handleDocumentPointerDown(event: PointerEvent): void {
    if (!this.isAddMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (this.addMenuPanel.getElement().contains(target)) return;
    this.closeAddMenu();
  }

  /**
   * Returns whether tab DOM can be patched instead of rebuilt.
   *
   * @param previousIds Previous workspace ids in order.
   * @param nextIds Next workspace ids in order.
   * @returns True when the same tabs exist in the same order.
   */
  private canPatchTabs(previousIds: readonly string[], nextIds: readonly string[]): boolean {
    if (previousIds.length === 0 || previousIds.length !== nextIds.length) return false;
    return previousIds.every((id, index) => id === nextIds[index]);
  }

  /**
   * Updates tab labels and active styles without destroying tab elements.
   *
   * @param workspaces Current workspace list.
   * @param activeId Active workspace id.
   */
  private patchTabsInPlace(workspaces: readonly WorkspaceDefinition[], activeId: string): void {
    for (const workspace of workspaces) {
      const tab = this.getTabButton(workspace.id);
      if (!tab) continue;
      if (this.activeRename && tab.contains(document.activeElement)) {
        this.applyTabActiveStyles(tab, workspace.id === activeId);
        continue;
      }
      const nameSpan = tab.querySelector('.editor-workspace-tab-name');
      if (nameSpan) {
        nameSpan.textContent = workspace.name;
      }
      tab.title = workspace.name;
      this.applyTabActiveStyles(tab, workspace.id === activeId);
    }
  }

  /** Rebuilds tab buttons from the current workspace list. */
  private rebuildTabs(): void {
    this.disposeActiveRename();
    this.tabsHost.replaceChildren();
    for (const workspace of this.workspaces) {
      this.tabsHost.appendChild(this.createTab(workspace));
    }
  }

  /**
   * Creates one workspace tab button with middle-click close and double-click
   * rename.
   *
   * @param workspace Workspace definition.
   * @returns Tab button.
   */
  private createTab(workspace: WorkspaceDefinition): HTMLElement {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset['workspaceId'] = workspace.id;
    tab.title = workspace.name;
    tab.draggable = true;
    this.applyTabChromeStyles(tab);
    this.applyTabActiveStyles(tab, workspace.id === this.activeId);
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('editor-workspace-tab-name');
    nameSpan.textContent = workspace.name;
    tab.appendChild(nameSpan);
    this.bindTabInteractions(tab, nameSpan, workspace.id);
    return tab;
  }

  /**
   * Applies shared chrome styles for a workspace tab button.
   *
   * @param tab Tab button to style.
   */
  private applyTabChromeStyles(tab: HTMLButtonElement): void {
    tab.style.border = 'none';
    tab.style.borderRadius = '3px';
    tab.style.padding = '2px 10px';
    tab.style.margin = '0 1px';
    tab.style.cursor = 'grab';
    tab.style.fontSize = '12px';
    tab.style.whiteSpace = 'nowrap';
    tab.style.display = 'inline-flex';
    tab.style.alignItems = 'center';
  }

  /**
   * Applies active/inactive colors for a tab button.
   *
   * @param tab Tab button.
   * @param isActive Whether the tab is the active workspace.
   */
  private applyTabActiveStyles(tab: HTMLButtonElement, isActive: boolean): void {
    tab.style.background = isActive ? `#${Theme.buttonHoverColor.toString(16).padStart(6, '0')}` : 'transparent';
    tab.style.color = isActive ? `#${Theme.selectionColor.toString(16).padStart(6, '0')}` : Theme.buttonTextColor;
  }

  /**
   * Binds click, middle-click close, and double-click rename on a tab.
   * Selection is immediate. Double-click rename works on the active tab (same
   * pattern as browser tabs: select first if needed, then rename).
   *
   * @param tab Tab button.
   * @param nameSpan Name label span inside the tab.
   * @param workspaceId Stable workspace id for this tab.
   */
  private bindTabInteractions(tab: HTMLButtonElement, nameSpan: HTMLSpanElement, workspaceId: string): void {
    tab.addEventListener('click', (event) => this.handleTabSelectClick(event, workspaceId));
    tab.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    tab.addEventListener('auxclick', (event) => this.handleTabMiddleClickClose(event, workspaceId));
    nameSpan.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.beginRename(tab, nameSpan, workspaceId);
    });
    this.bindTabDragReorder(tab, workspaceId);
  }

  /**
   * Selects a workspace tab on a primary single-click.
   *
   * @param event Click event.
   * @param workspaceId Workspace id for the tab.
   */
  private handleTabSelectClick(event: MouseEvent, workspaceId: string): void {
    if (event.button !== 0) return;
    if (event.detail > 1) return;
    if (this.activeRename) return;
    if (workspaceId === this.activeId) return;
    this.actions.onSelectWorkspace(workspaceId);
  }

  /**
   * Deletes a workspace on middle-click (auxclick button 1).
   *
   * @param event Auxclick event.
   * @param workspaceId Workspace id for the tab.
   */
  private handleTabMiddleClickClose(event: MouseEvent, workspaceId: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    this.actions.onDeleteWorkspace(workspaceId);
  }

  /**
   * Binds HTML5 drag-and-drop so tabs can be reordered left/right.
   *
   * @param tab Tab button.
   * @param workspaceId Workspace id for this tab.
   */
  private bindTabDragReorder(tab: HTMLButtonElement, workspaceId: string): void {
    tab.addEventListener('dragstart', (event) => {
      if (this.activeRename) {
        event.preventDefault();
        return;
      }
      this.beginTabDragSession(workspaceId, tab, event);
    });
    tab.addEventListener('dragend', () => {
      this.endTabDragSession();
      tab.style.opacity = '1';
    });
    const onHoverTarget = (event: DragEvent): void => this.handleTabDragHover(event, tab, workspaceId);
    tab.addEventListener('dragenter', onHoverTarget);
    tab.addEventListener('dragover', onHoverTarget);
    tab.addEventListener('drop', (event) => this.handleTabDrop(event, tab, workspaceId));
  }

  /**
   * Accepts drag-over on a tab and updates the orange insert indicator.
   *
   * @param event Drag event on the tab.
   * @param tab Hovered tab button.
   * @param workspaceId Hovered workspace id.
   */
  private handleTabDragHover(event: DragEvent, tab: HTMLButtonElement, workspaceId: string): void {
    if (!this.dragWorkspaceId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragWorkspaceId === workspaceId) {
      this.hideInsertIndicator();
      return;
    }
    this.showInsertIndicatorForTarget(tab, workspaceId);
  }

  /**
   * Completes a reorder when the user drops onto a specific tab.
   *
   * @param event Drop event.
   * @param tab Drop target tab.
   * @param workspaceId Drop target workspace id.
   */
  private handleTabDrop(event: DragEvent, tab: HTMLButtonElement, workspaceId: string): void {
    event.preventDefault();
    event.stopPropagation();
    const sourceId =
      this.dragWorkspaceId ??
      event.dataTransfer?.getData('application/x-workspace-id') ??
      event.dataTransfer?.getData('text/plain');
    tab.style.opacity = '1';
    this.hideInsertIndicator();
    this.endTabDragSession();
    if (!sourceId || sourceId === workspaceId) return;
    const targetIndex = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (targetIndex < 0) return;
    this.finishTabReorder(sourceId, targetIndex);
  }

  /**
   * Starts a tab drag: tracks the source id and installs a document-level
   * dragover so gaps never show the forbidden cursor.
   *
   * @param workspaceId Dragged workspace id.
   * @param tab Source tab button.
   * @param event Drag start event.
   */
  private beginTabDragSession(workspaceId: string, tab: HTMLButtonElement, event: DragEvent): void {
    this.dragWorkspaceId = workspaceId;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', workspaceId);
      event.dataTransfer.setData('application/x-workspace-id', workspaceId);
      event.dataTransfer.effectAllowed = 'move';
    }
    tab.style.opacity = '0.55';
    document.addEventListener('dragover', this.onDocumentDragOver, true);
    document.addEventListener('dragenter', this.onDocumentDragOver, true);
  }

  /** Ends a tab drag session and removes document drag listeners. */
  private endTabDragSession(): void {
    this.dragWorkspaceId = null;
    this.hideInsertIndicator();
    document.removeEventListener('dragover', this.onDocumentDragOver, true);
    document.removeEventListener('dragenter', this.onDocumentDragOver, true);
    this.tabsHost.querySelectorAll('button[data-workspace-id]').forEach((element) => {
      if (element instanceof HTMLElement) {
        element.style.opacity = '1';
      }
    });
  }

  /**
   * While a tab is being dragged, accept drop anywhere so the cursor never
   * flickers to forbidden over tiny gaps or non-tab chrome.
   *
   * @param event Document dragover / dragenter event.
   */
  private handleDocumentDragOver(event: DragEvent): void {
    if (!this.dragWorkspaceId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Shows the orange insert line on the correct side of a hovered tab. Dragging
   * right → line on the right of the target; dragging left → left.
   *
   * @param targetTab Hovered tab button.
   * @param targetWorkspaceId Hovered workspace id.
   */
  private showInsertIndicatorForTarget(targetTab: HTMLButtonElement, targetWorkspaceId: string): void {
    if (!this.dragWorkspaceId) {
      this.hideInsertIndicator();
      return;
    }
    const fromIndex = this.workspaces.findIndex((item) => item.id === this.dragWorkspaceId);
    const targetIndex = this.workspaces.findIndex((item) => item.id === targetWorkspaceId);
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
      this.hideInsertIndicator();
      return;
    }
    const side: 'left' | 'right' = fromIndex < targetIndex ? 'right' : 'left';
    this.positionInsertIndicator(targetTab, side);
  }

  /** Shows the insert line after the last tab (drop at end of strip). */
  private showInsertIndicatorAtEnd(): void {
    const tabs = Array.from(this.tabsHost.querySelectorAll('button[data-workspace-id]'));
    const last = tabs[tabs.length - 1];
    if (!(last instanceof HTMLButtonElement)) {
      this.hideInsertIndicator();
      return;
    }
    if (this.dragWorkspaceId && last.dataset['workspaceId'] === this.dragWorkspaceId) {
      this.hideInsertIndicator();
      return;
    }
    this.positionInsertIndicator(last, 'right');
  }

  /**
   * Positions the orange insert marker on the left or right edge of a tab.
   *
   * @param targetTab Tab to anchor against.
   * @param side Which edge receives the line.
   */
  private positionInsertIndicator(targetTab: HTMLButtonElement, side: 'left' | 'right'): void {
    this.ensureInsertIndicatorAttached();
    const rootRect = this.root.getBoundingClientRect();
    const tabRect = targetTab.getBoundingClientRect();
    const x = side === 'left' ? tabRect.left - rootRect.left : tabRect.right - rootRect.left;
    this.insertIndicator.style.display = 'block';
    this.insertIndicator.style.left = `${Math.round(x)}px`;
    this.insertIndicator.style.top = `${Math.round(tabRect.top - rootRect.top)}px`;
    this.insertIndicator.style.height = `${Math.max(12, Math.round(tabRect.height))}px`;
  }

  /** Re-parents the insert marker on the bar root when missing. */
  private ensureInsertIndicatorAttached(): void {
    if (this.insertIndicator.parentElement === this.root) return;
    this.root.appendChild(this.insertIndicator);
  }

  /** Hides the orange insert marker. */
  private hideInsertIndicator(): void {
    this.insertIndicator.style.display = 'none';
  }

  /**
   * Returns the insert indicator element for tests.
   *
   * @returns Indicator element.
   */
  getInsertIndicatorForTests(): HTMLElement {
    return this.insertIndicator;
  }

  /**
   * Commits a tab reorder through the host action. {@code toIndex} is the final
   * desired index of the dragged tab (the drop target's index). Dropping on the
   * next tab swaps places; dropping on the last tab moves there.
   *
   * @param workspaceId Dragged workspace id.
   * @param toIndex Destination index (drop target index).
   */
  private finishTabReorder(workspaceId: string, toIndex: number): void {
    const fromIndex = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    this.actions.onReorderWorkspace(workspaceId, toIndex);
  }

  /**
   * Starts shared inline rename for a workspace tab name.
   *
   * @param tab Tab button host.
   * @param nameSpan Name label span.
   * @param workspaceId Workspace being renamed.
   */
  private beginRename(tab: HTMLButtonElement, nameSpan: HTMLSpanElement, workspaceId: string): void {
    const workspace = this.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    this.disposeActiveRename();
    const originalName = workspace.name;
    const renameInput = new InputInlineRename(tab, nameSpan, originalName);
    this.activeRename = renameInput;
    renameInput.setConfirmCallback((newName) => {
      this.activeRename = null;
      nameSpan.textContent = newName;
      tab.title = newName;
      this.workspaces = this.workspaces.map((item) => (item.id === workspaceId ? { ...item, name: newName } : item));
      if (newName !== originalName) {
        this.actions.onRenameWorkspace(workspaceId, newName);
      }
    });
    renameInput.setCancelCallback(() => {
      this.activeRename = null;
    });
    renameInput.activate();
  }

  /** Disposes any in-progress tab rename session. */
  private disposeActiveRename(): void {
    if (!this.activeRename) return;
    this.activeRename.dispose();
    this.activeRename = null;
  }
}
