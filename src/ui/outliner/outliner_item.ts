import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';
import { ObjectIconFactory } from './object_icon_factory.js';
import { InlineRenameInput } from './inline_rename_input.js';

/**
 * Callback type for item selection events.
 * @param obj The Three.js object that was selected.
 * @param event The mouse event that triggered selection (for modifiers).
 */
export type ItemSelectCallback = (obj: THREE.Object3D, event?: MouseEvent) => void;

/**
 * Callback type for visibility toggle events.
 * @param obj The Three.js object whose visibility toggled.
 */
export type ItemVisibilityCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for lock toggle events.
 * @param obj The Three.js object whose lock state toggled.
 */
export type ItemLockCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for expand/collapse toggle events.
 * @param obj The Three.js object that was expanded or collapsed.
 */
export type ItemExpandCallback = (obj: THREE.Object3D) => void;

/**
 * Callback type for double-click rename events.
 * @param obj The Three.js object that was double-clicked.
 * @param newName The new name entered by the user.
 */
export type ItemRenameCallback = (obj: THREE.Object3D, newName: string) => void;

/**
 * Callback type for context menu requests.
 * @param obj The Three.js object for the context menu.
 * @param x The horizontal screen coordinate.
 * @param y The vertical screen coordinate.
 */
export type ItemContextMenuCallback = (obj: THREE.Object3D, x: number, y: number) => void;

/**
 * Callback type for drag-start events on an outliner row.
 * @param obj The Three.js object being dragged.
 * @param event The native drag event.
 */
export type ItemDragStartCallback = (obj: THREE.Object3D, event: DragEvent) => void;

/**
 * Callback type for drop events on an outliner row.
 * @param target The Three.js object under the drop.
 * @param event The native drop event.
 */
export type ItemDropCallback = (target: THREE.Object3D, event: DragEvent) => void;

/**
 * Single row in the outliner tree representing one Three.js object.
 * Displays icon, name, expand chevron, visibility and lock toggles.
 */
export class OutlinerItem {
  private rowElement: HTMLElement;
  private iconElement: HTMLElement;
  private nameElement: HTMLSpanElement;
  private chevronElement: HTMLElement;
  private visibilityElement: HTMLElement;
  private lockElement: HTMLElement;
  private object: THREE.Object3D;
  private depth: number;
  private isSelected: boolean;
  private isExpanded: boolean;
  private isVisible: boolean;
  private isLocked: boolean;
  private isDisposed: boolean;
  private renameInput: InlineRenameInput | null;
  private onSelect: ItemSelectCallback | null;
  private onToggleVisibility: ItemVisibilityCallback | null;
  private onToggleLock: ItemLockCallback | null;
  private onToggleExpand: ItemExpandCallback | null;
  private onRename: ItemRenameCallback | null;
  private onContextMenu: ItemContextMenuCallback | null;
  private onDragStartCallback: ItemDragStartCallback | null;
  private onDropCallback: ItemDropCallback | null;
  private hasChildren: boolean;

  /**
   * Creates a new outliner item for a Three.js object.
   * @param object The Three.js object this row represents.
   * @param depth The indentation depth level in the hierarchy.
   * @param hasChildren Whether the object has child objects.
   */
  constructor(
    object: THREE.Object3D,
    depth: number,
    hasChildren: boolean
  ) {
    this.object = object;
    this.depth = depth;
    this.hasChildren = hasChildren;
    this.isSelected = false;
    this.isExpanded = true;
    this.isVisible = object.visible;
    this.isLocked = object.userData.editorLocked === true;
    this.isDisposed = false;
    this.renameInput = null;
    this.onSelect = null;
    this.onToggleVisibility = null;
    this.onToggleLock = null;
    this.onToggleExpand = null;
    this.onRename = null;
    this.onContextMenu = null;
    this.onDragStartCallback = null;
    this.onDropCallback = null;
    this.rowElement = document.createElement('div');
    this.iconElement = document.createElement('span');
    this.nameElement = document.createElement('span');
    this.chevronElement = document.createElement('span');
    this.visibilityElement = document.createElement('span');
    this.lockElement = document.createElement('span');
    this.buildRow();
  }

  /**
   * Returns the root DOM element of this item.
   * @returns The row element.
   */
  getElement(): HTMLElement {
    return this.rowElement;
  }

  /**
   * Returns the Three.js object this item represents.
   * @returns The associated Three.js object.
   */
  getObject(): THREE.Object3D {
    return this.object;
  }

  /**
   * Sets the selection state and updates visual appearance.
   * @param selected True to highlight the item as selected.
   */
  setSelectionState(selected: boolean): void {
    this.isSelected = selected;
    if (selected) {
      this.rowElement.style.background = Theme.outlinerSelectedColor;
    } else {
      this.rowElement.style.background = 'transparent';
    }
  }

  /**
   * Sets the expanded state and updates the chevron.
   * @param expanded True to show the expanded chevron state.
   */
  setExpandedState(expanded: boolean): void {
    this.isExpanded = expanded;
    this.updateChevron();
  }

  /**
   * Sets the visibility state and updates the visibility icon.
   * @param visible True to show the visible state.
   */
  setVisibilityState(visible: boolean): void {
    this.isVisible = visible;
    this.updateVisibilityIcon();
  }

  /**
   * Sets the lock state and updates the lock icon.
   * @param locked True to show the locked state.
   */
  setLockState(locked: boolean): void {
    this.isLocked = locked;
    this.updateLockIcon();
  }

  /**
   * Registers the callback for selection events.
   * @param callback The function to call on item selection.
   */
  onSelection(callback: ItemSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * Registers the callback for visibility toggle events.
   * @param callback The function to call on visibility toggle.
   */
  onVisibilityToggle(callback: ItemVisibilityCallback): void {
    this.onToggleVisibility = callback;
  }

  /**
   * Registers the callback for lock toggle events.
   * @param callback The function to call on lock toggle.
   */
  onLockToggle(callback: ItemLockCallback): void {
    this.onToggleLock = callback;
  }

  /**
   * Registers the callback for expand/collapse events.
   * @param callback The function to call on expand toggle.
   */
  onExpandToggle(callback: ItemExpandCallback): void {
    this.onToggleExpand = callback;
  }

  /**
   * Registers the callback for rename events.
   * @param callback The function to call on rename trigger.
   */
  onRenameRequest(callback: ItemRenameCallback): void {
    this.onRename = callback;
  }

  /**
   * Registers the callback for context menu events.
   * @param callback The function to call on context menu trigger.
   */
  onContextMenuRequest(callback: ItemContextMenuCallback): void {
    this.onContextMenu = callback;
  }

  /**
   * Registers the callback for drag-start events.
   * @param callback The function to call when a drag begins.
   */
  onDragStartRequest(callback: ItemDragStartCallback): void {
    this.onDragStartCallback = callback;
  }

  /**
   * Registers the callback for drop events.
   * @param callback The function to call when an item is dropped here.
   */
  onDropRequest(callback: ItemDropCallback): void {
    this.onDropCallback = callback;
  }

  /**
   * Starts inline rename editing for this item.
   */
  startRename(): void {
    if (this.isDisposed) return;
    this.renameInput = new InlineRenameInput(
      this.rowElement,
      this.nameElement,
      this.object.name
    );
    this.renameInput.setConfirmCallback((newName) => {
      if (this.onRename) {
        this.onRename(this.object, newName);
      }
    });
    this.renameInput.setCancelCallback(() => {
      this.renameInput = null;
    });
    this.renameInput.activate();
  }

  /**
   * Disposes this item and removes it from the DOM.
   */
  dispose(): void {
    this.isDisposed = true;
    if (this.renameInput) {
      this.renameInput.dispose();
      this.renameInput = null;
    }
    if (this.rowElement.parentNode) {
      this.rowElement.parentNode.removeChild(this.rowElement);
    }
  }

  /**
   * Builds the complete row DOM structure.
   */
  private buildRow(): void {
    this.applyRowStyles();
    this.buildChevron();
    this.buildIcon();
    this.buildName();
    this.buildVisibilityIcon();
    this.buildLockIcon();
    this.rowElement.appendChild(this.chevronElement);
    this.rowElement.appendChild(this.iconElement);
    this.rowElement.appendChild(this.nameElement);
    this.rowElement.appendChild(this.visibilityElement);
    this.rowElement.appendChild(this.lockElement);
    this.bindRowEvents();
  }

  /**
   * Applies base styles to the row element.
   */
  private applyRowStyles(): void {
    this.rowElement.style.display = 'flex';
    this.rowElement.style.alignItems = 'center';
    this.rowElement.style.padding = '3px 4px';
    this.rowElement.style.paddingLeft = `${4 + this.depth * 16}px`;
    this.rowElement.style.cursor = 'pointer';
    this.rowElement.style.fontFamily = 'monospace';
    this.rowElement.style.fontSize = '12px';
    this.rowElement.style.color = Theme.buttonTextColor;
    this.rowElement.style.borderRadius = '2px';
    this.rowElement.style.userSelect = 'none';
    this.rowElement.style.minHeight = '20px';
  }

  /**
   * Builds the expand/collapse chevron element.
   */
  private buildChevron(): void {
    this.chevronElement.style.width = '16px';
    this.chevronElement.style.textAlign = 'center';
    this.chevronElement.style.color = '#888888';
    this.chevronElement.style.fontSize = '10px';
    this.chevronElement.style.flexShrink = '0';
    if (!this.hasChildren) {
      this.chevronElement.style.visibility = 'hidden';
    }
    this.updateChevron();
    this.chevronElement.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      if (this.hasChildren && this.onToggleExpand) {
        this.onToggleExpand(this.object);
      }
    });
  }

  /**
   * Updates the chevron character based on expanded state.
   */
  private updateChevron(): void {
    if (!this.hasChildren) return;
    this.chevronElement.textContent = this.isExpanded ? '▼' : '▶';
  }

  /**
   * Builds the object type icon element.
   */
  private buildIcon(): void {
    const icon = ObjectIconFactory.getIcon(this.object);
    this.iconElement.textContent = icon.character;
    this.iconElement.style.color = icon.color;
    this.iconElement.style.marginRight = '4px';
    this.iconElement.style.flexShrink = '0';
    this.iconElement.style.fontSize = '12px';
  }

  /**
   * Builds the name text span element.
   */
  private buildName(): void {
    this.nameElement.textContent = this.object.name || 'Unnamed';
    this.nameElement.style.flex = '1';
    this.nameElement.style.overflow = 'hidden';
    this.nameElement.style.textOverflow = 'ellipsis';
    this.nameElement.style.whiteSpace = 'nowrap';
    this.nameElement.addEventListener('dblclick', (event: MouseEvent) => {
      event.stopPropagation();
      this.startRename();
    });
  }

  /**
   * Builds the visibility toggle icon element.
   */
  private buildVisibilityIcon(): void {
    this.visibilityElement.style.cursor = 'pointer';
    this.visibilityElement.style.marginLeft = '4px';
    this.visibilityElement.style.flexShrink = '0';
    this.visibilityElement.style.fontSize = '14px';
    this.updateVisibilityIcon();
    this.visibilityElement.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      if (this.onToggleVisibility) {
        this.onToggleVisibility(this.object);
      }
    });
  }

  /**
   * Updates the visibility icon character and color.
   */
  private updateVisibilityIcon(): void {
    this.visibilityElement.textContent = this.isVisible ? '👁' : '👁‍🗨';
    this.visibilityElement.style.color = this.isVisible ? '#ffffff' : '#555555';
  }

  /**
   * Builds the lock toggle icon element.
   */
  private buildLockIcon(): void {
    this.lockElement.style.cursor = 'pointer';
    this.lockElement.style.marginLeft = '2px';
    this.lockElement.style.flexShrink = '0';
    this.lockElement.style.fontSize = '12px';
    this.lockElement.title = 'Lock (prevent edit/delete/transform)';
    this.updateLockIcon();
    this.lockElement.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      if (this.onToggleLock) {
        this.onToggleLock(this.object);
        return;
      }
      this.isLocked = !this.isLocked;
      this.updateLockIcon();
    });
  }

  /**
   * Updates the lock icon character and color.
   */
  private updateLockIcon(): void {
    this.lockElement.textContent = this.isLocked ? '🔒' : '🔓';
    this.lockElement.style.color = this.isLocked ? '#e67e22' : '#555555';
  }

  /**
   * Binds interaction events to the row element.
   */
  private bindRowEvents(): void {
    this.rowElement.draggable = true;
    this.rowElement.addEventListener('click', (event: MouseEvent) => {
      if (event.detail > 1) return;
      if (this.onSelect) {
        this.onSelect(this.object, event);
      }
    });
    this.rowElement.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.onContextMenu) {
        this.onContextMenu(this.object, event.clientX, event.clientY);
      }
    });
    this.bindDragAndDropEvents();
    this.rowElement.addEventListener('mouseenter', () => {
      if (!this.isSelected) {
        this.rowElement.style.background = hexToRgb(Theme.buttonHoverColor);
      }
    });
    this.rowElement.addEventListener('mouseleave', () => {
      if (!this.isSelected) {
        this.rowElement.style.background = 'transparent';
      }
    });
  }

  /**
   * Binds HTML5 drag-and-drop events used for hierarchy reparenting.
   */
  private bindDragAndDropEvents(): void {
    this.rowElement.addEventListener('dragstart', (event: DragEvent) => {
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', this.object.uuid);
      }
      if (this.onDragStartCallback) {
        this.onDragStartCallback(this.object, event);
      }
    });
    this.rowElement.addEventListener('dragover', (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      this.rowElement.style.outline = `1px solid ${hexToRgb(Theme.selectionColor)}`;
    });
    this.rowElement.addEventListener('dragleave', () => {
      this.rowElement.style.outline = 'none';
    });
    this.rowElement.addEventListener('drop', (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.rowElement.style.outline = 'none';
      if (this.onDropCallback) {
        this.onDropCallback(this.object, event);
      }
    });
  }
}

