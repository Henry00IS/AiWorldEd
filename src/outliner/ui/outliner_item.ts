import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { InputInlineRename } from '@/ui/input/input_inline_rename.js';
import {
  OUTLINER_BASE_PADDING_PX,
  OUTLINER_CHEVRON_WIDTH_PX,
  OUTLINER_INDENT_PX,
  OUTLINER_ROW_HEIGHT_PX,
} from './outliner_drop_placement.js';
import { OUTLINER_ROW_ELEMENT_CLASS } from './outliner_tree_drag_row_hit.js';
import { IconOutlinerVisibility } from './icon_outliner_visibility.js';
import { outlinerItemApplyIconFromObject } from './outliner_item_icon.js';
import { extractHierarchyNameBase, parseHierarchyHexSuffix } from '@/utils/utils_hierarchy_name_allocator.js';
import type {
  ItemContextMenuCallback,
  ItemDragEndCallback,
  ItemDragHoverCallback,
  ItemDragStartCallback,
  ItemDropCallback,
  ItemExpandCallback,
  ItemLockCallback,
  ItemRenameCallback,
  ItemSelectCallback,
  ItemVisibilityCallback,
} from './outliner_item_types.js';

export type {
  ItemContextMenuCallback,
  ItemDragEndCallback,
  ItemDragHoverCallback,
  ItemDragStartCallback,
  ItemDropCallback,
  ItemExpandCallback,
  ItemLockCallback,
  ItemRenameCallback,
  ItemSelectCallback,
  ItemVisibilityCallback,
} from './outliner_item_types.js';

/** Another collaborator holding an object, shown as a coloured row marker. */
export interface OutlinerRemoteHolder {
  /** Display name of the collaborator. */
  name: string;
  /** CSS colour of the collaborator. */
  color: string;
}

/** Resolves which collaborator, if any, holds an object. */
export type OutlinerRemoteHolderResolver = (object: THREE.Object3D) => OutlinerRemoteHolder | null;

/**
 * Single row in the outliner tree representing one Three.js object. Displays
 * icon, name, expand chevron, visibility and lock toggles.
 */
export class OutlinerItem {
  private rowElement: HTMLElement;
  private iconElement: HTMLElement;
  private iconGlyphElement: HTMLElement;
  private iconBadgeElement: HTMLElement;
  private nameElement: HTMLSpanElement;
  private nameBaseElement: HTMLSpanElement;
  private nameIdElement: HTMLSpanElement;
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
  private renameInput: InputInlineRename | null;
  private onSelect: ItemSelectCallback | null;
  private onToggleVisibility: ItemVisibilityCallback | null;
  private onToggleLock: ItemLockCallback | null;
  private onToggleExpand: ItemExpandCallback | null;
  private onRename: ItemRenameCallback | null;
  private onContextMenu: ItemContextMenuCallback | null;
  private onDragStartCallback: ItemDragStartCallback | null;
  private onDragHoverCallback: ItemDragHoverCallback | null;
  private onDropCallback: ItemDropCallback | null;
  private onDragEndCallback: ItemDragEndCallback | null;
  private hasChildren: boolean;
  private isIntoDropHighlighted: boolean;
  private isDragSourceVisual: boolean;
  private remoteHolder: OutlinerRemoteHolder | null = null;

  /**
   * Creates a new outliner item for a Three.js object.
   *
   * @param object The Three.js object this row represents.
   * @param depth The indentation depth level in the hierarchy.
   * @param hasChildren Whether the object has child objects.
   */
  constructor(object: THREE.Object3D, depth: number, hasChildren: boolean) {
    this.object = object;
    this.depth = depth;
    this.hasChildren = hasChildren;
    this.isSelected = false;
    this.isExpanded = true;
    this.isVisible = object.visible;
    this.isLocked = object.userData['editorLocked'] === true;
    this.isDisposed = false;
    this.renameInput = null;
    this.onSelect = null;
    this.onToggleVisibility = null;
    this.onToggleLock = null;
    this.onToggleExpand = null;
    this.onRename = null;
    this.onContextMenu = null;
    this.onDragStartCallback = null;
    this.onDragHoverCallback = null;
    this.onDropCallback = null;
    this.onDragEndCallback = null;
    this.isIntoDropHighlighted = false;
    this.isDragSourceVisual = false;
    this.rowElement = document.createElement('div');
    this.iconElement = document.createElement('span');
    this.iconGlyphElement = document.createElement('span');
    this.iconBadgeElement = document.createElement('span');
    this.nameElement = document.createElement('span');
    this.nameBaseElement = document.createElement('span');
    this.nameIdElement = document.createElement('span');
    this.chevronElement = document.createElement('span');
    this.visibilityElement = document.createElement('span');
    this.lockElement = document.createElement('span');
    this.buildRow();
  }

  /**
   * Returns the root DOM element of this item.
   *
   * @returns The row element.
   */
  getElement(): HTMLElement {
    return this.rowElement;
  }

  /**
   * Returns the Three.js object this item represents.
   *
   * @returns The associated Three.js object.
   */
  getObject(): THREE.Object3D {
    return this.object;
  }

  /**
   * Rebinds this recycled row to a different hierarchy object without
   * recreating the DOM.
   *
   * @param object The Three.js object this row should represent.
   * @param depth The indentation depth level in the hierarchy.
   * @param hasChildren Whether the object has child objects.
   */
  rebindObject(object: THREE.Object3D, depth: number, hasChildren: boolean): void {
    if (this.isDisposed) {
      return;
    }
    const objectChanged = this.object !== object;
    if (objectChanged) {
      this.renameSessionDisposeIfActive();
      this.setDragSourceVisual(false);
      this.setIntoDropHighlight(false);
    }
    this.object = object;
    this.rowElement.dataset['outlinerObjectUuid'] = object.uuid;
    this.applyNameLabelText(object.name);
    this.setDepth(depth);
    this.setHasChildren(hasChildren);
    this.applyIconFromObject();
  }

  /**
   * Shows or hides this row in the virtual pool without disposing it.
   *
   * @param isVisible True to display the row as a flex item.
   */
  poolVisibilitySet(isVisible: boolean): void {
    if (this.isDisposed) {
      return;
    }
    this.rowElement.style.display = isVisible ? 'flex' : 'none';
  }

  /**
   * Returns whether this row is currently disposed.
   *
   * @returns True when dispose has been called.
   */
  disposedIs(): boolean {
    return this.isDisposed;
  }

  /**
   * Returns the hierarchy indent depth of this row.
   *
   * @returns Depth starting at 0 for direct root children.
   */
  getDepth(): number {
    return this.depth;
  }

  /**
   * Returns the name label element (text column start for insert-line
   * geometry).
   *
   * @returns Name span element.
   */
  getNameElement(): HTMLSpanElement {
    return this.nameElement;
  }

  /**
   * Sets the selection state and updates visual appearance.
   *
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
   * Updates indentation depth without recreating the row (search/filter reuse).
   *
   * @param depth Hierarchy depth starting at 0 for root children.
   */
  setDepth(depth: number): void {
    if (this.depth === depth) return;
    this.depth = depth;
    this.rowElement.style.paddingLeft = `${OUTLINER_BASE_PADDING_PX + this.depth * OUTLINER_INDENT_PX}px`;
  }

  /**
   * Updates whether the chevron should show children.
   *
   * @param hasChildren True when the object has content children.
   */
  setHasChildren(hasChildren: boolean): void {
    if (this.hasChildren === hasChildren) return;
    this.hasChildren = hasChildren;
    this.updateChevron();
  }

  /**
   * Sets the expanded state and updates the chevron.
   *
   * @param expanded True to show the expanded chevron state.
   */
  setExpandedState(expanded: boolean): void {
    this.isExpanded = expanded;
    this.updateChevron();
  }

  /**
   * Sets the visibility state and updates the visibility icon.
   *
   * @param visible True to show the visible state.
   */
  setVisibilityState(visible: boolean): void {
    this.isVisible = visible;
    this.updateVisibilityIcon();
  }

  /**
   * Sets the lock state and updates the lock icon.
   *
   * @param locked True to show the locked state.
   */
  setLockState(locked: boolean): void {
    this.isLocked = locked;
    this.updateLockIcon();
  }

  /**
   * Marks the row as held by another collaborator (coloured edge and tooltip),
   * or clears the marker.
   *
   * @param holder Collaborator holding the object, or null.
   */
  setRemoteHolder(holder: OutlinerRemoteHolder | null): void {
    if (holder?.name === this.remoteHolder?.name && holder?.color === this.remoteHolder?.color) return;
    this.remoteHolder = holder;
    this.rowElement.style.boxShadow = holder === null ? '' : `inset 3px 0 0 ${holder.color}`;
    this.rowElement.title = holder === null ? '' : `Being edited by ${holder.name}`;
  }

  /**
   * Re-reads the object type icon (and operation badge) from the live object.
   * Used when CSG operation or object kind changes without recreating the row.
   */
  refreshIcon(): void {
    this.applyIconFromObject();
  }

  /**
   * Registers the callback for selection events.
   *
   * @param callback The function to call on item selection.
   */
  onSelection(callback: ItemSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * Registers the callback for visibility toggle events.
   *
   * @param callback The function to call on visibility toggle.
   */
  onVisibilityToggle(callback: ItemVisibilityCallback): void {
    this.onToggleVisibility = callback;
  }

  /**
   * Registers the callback for lock toggle events.
   *
   * @param callback The function to call on lock toggle.
   */
  onLockToggle(callback: ItemLockCallback): void {
    this.onToggleLock = callback;
  }

  /**
   * Registers the callback for expand/collapse events.
   *
   * @param callback The function to call on expand toggle.
   */
  onExpandToggle(callback: ItemExpandCallback): void {
    this.onToggleExpand = callback;
  }

  /**
   * Registers the callback for rename events.
   *
   * @param callback The function to call on rename trigger.
   */
  onRenameRequest(callback: ItemRenameCallback): void {
    this.onRename = callback;
  }

  /**
   * Registers the callback for context menu events.
   *
   * @param callback The function to call on context menu trigger.
   */
  onContextMenuRequest(callback: ItemContextMenuCallback): void {
    this.onContextMenu = callback;
  }

  /**
   * Registers the callback for drag-start events.
   *
   * @param callback The function to call when a drag begins.
   */
  onDragStartRequest(callback: ItemDragStartCallback): void {
    this.onDragStartCallback = callback;
  }

  /**
   * Registers the callback for drag-hover events used to place the insert line.
   *
   * @param callback The function to call while dragging over this row.
   */
  onDragHoverRequest(callback: ItemDragHoverCallback): void {
    this.onDragHoverCallback = callback;
  }

  /**
   * Registers the callback for drop events.
   *
   * @param callback The function to call when an item is dropped here.
   */
  onDropRequest(callback: ItemDropCallback): void {
    this.onDropCallback = callback;
  }

  /**
   * Registers the callback for drag-end events.
   *
   * @param callback The function to call when a drag ends.
   */
  onDragEndRequest(callback: ItemDragEndCallback): void {
    this.onDragEndCallback = callback;
  }

  /**
   * Sets a reduced opacity while this row is the active drag source.
   *
   * @param isDragging True when this row is being dragged.
   */
  setDragSourceVisual(isDragging: boolean): void {
    if (this.isDragSourceVisual === isDragging) {
      return;
    }
    this.isDragSourceVisual = isDragging;
    this.rowElement.style.opacity = isDragging ? '0.55' : '1';
  }

  /**
   * Highlights the row as a nest-into target (middle band on containers).
   *
   * @param isIntoTarget True when the pointer is in the into zone.
   */
  setIntoDropHighlight(isIntoTarget: boolean): void {
    if (this.isIntoDropHighlighted === isIntoTarget) {
      return;
    }
    this.isIntoDropHighlighted = isIntoTarget;
    this.rowElement.style.outline = isIntoTarget ? `1px solid ${hexToRgb(Theme.selectionColor)}` : 'none';
  }

  /**
   * Starts inline rename editing for this item, unless another member is
   * editing it.
   */
  startRename(): void {
    if (this.isDisposed || this.remoteHolder !== null) {
      return;
    }
    this.renameSessionDisposeIfActive();
    this.renameInput = new InputInlineRename(this.rowElement, this.nameElement, this.object.name);
    this.renameInput.setConfirmCallback((newName) => {
      this.renameInput = null;
      this.applyNameLabelText(newName);
      if (this.onRename) {
        this.onRename(this.object, newName);
      }
    });
    this.renameInput.setCancelCallback(() => {
      this.renameInput = null;
      this.applyNameLabelText(this.object.name);
    });
    this.renameInput.activate(this.resolveOutlinerRenameSelectionRange());
  }

  /**
   * Builds the initial rename selection for outliner rows. When the display
   * name has a valid auto hex id suffix, only the base name is selected so the
   * gray id is not highlighted.
   *
   * @returns Selection range, or undefined for full-name selection.
   */
  private resolveOutlinerRenameSelectionRange(): { start: number; end: number } | undefined {
    if (parseHierarchyHexSuffix(this.object.name) === null) {
      return undefined;
    }
    const baseName = extractHierarchyNameBase(this.object.name);
    if (baseName.length <= 0 || baseName.length >= this.object.name.length) {
      return undefined;
    }
    return { start: 0, end: baseName.length };
  }

  /** Disposes this item and removes it from the DOM. */
  dispose(): void {
    this.isDisposed = true;
    this.renameSessionDisposeIfActive();
    if (this.rowElement.parentNode) {
      this.rowElement.parentNode.removeChild(this.rowElement);
    }
  }

  /** Cancels and clears an active inline rename session if one exists. */
  private renameSessionDisposeIfActive(): void {
    if (!this.renameInput) {
      return;
    }
    this.renameInput.dispose();
    this.renameInput = null;
  }

  /** Builds the complete row DOM structure. */
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

  /** Applies base styles to the row element. */
  private applyRowStyles(): void {
    this.rowElement.classList.add(OUTLINER_ROW_ELEMENT_CLASS);
    this.rowElement.dataset['outlinerObjectUuid'] = this.object.uuid;
    this.rowElement.style.display = 'flex';
    this.rowElement.style.alignItems = 'center';
    this.rowElement.style.boxSizing = 'border-box';
    this.rowElement.style.width = '100%';
    this.rowElement.style.minWidth = '0';
    this.rowElement.style.maxWidth = '100%';
    this.rowElement.style.overflow = 'hidden';
    this.rowElement.style.padding = '0 4px';
    this.rowElement.style.paddingLeft = `${OUTLINER_BASE_PADDING_PX + this.depth * OUTLINER_INDENT_PX}px`;
    this.rowElement.style.cursor = 'pointer';
    this.rowElement.style.fontFamily = 'monospace';
    this.rowElement.style.fontSize = '12px';
    this.rowElement.style.lineHeight = '1';
    this.rowElement.style.color = Theme.buttonTextColor;
    this.rowElement.style.borderRadius = '2px';
    this.rowElement.style.userSelect = 'none';
    this.rowElement.style.height = `${OUTLINER_ROW_HEIGHT_PX}px`;
    this.rowElement.style.minHeight = `${OUTLINER_ROW_HEIGHT_PX}px`;
  }

  /**
   * Styles a fixed-height flex slot so chevrons, icons, and toggles share the
   * same vertical center inside the row.
   *
   * @param element Slot element.
   * @param widthPx Optional fixed width.
   */
  private styleCenteredSlot(element: HTMLElement, widthPx?: number): void {
    element.style.display = 'inline-flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.flexShrink = '0';
    element.style.height = '16px';
    element.style.lineHeight = '1';
    element.style.boxSizing = 'border-box';
    if (widthPx !== undefined) {
      element.style.width = `${widthPx}px`;
    }
  }

  /** Builds the expand/collapse chevron element. */
  private buildChevron(): void {
    this.styleCenteredSlot(this.chevronElement, OUTLINER_CHEVRON_WIDTH_PX);
    this.chevronElement.style.color = '#888888';
    this.chevronElement.style.fontSize = '10px';
    this.chevronElement.style.transformOrigin = 'center center';
    this.chevronElement.style.transition = 'transform 0s';
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
   * Updates chevron visibility and orientation. Uses one glyph for both states
   * and rotates it so open/closed markers stay the same visual size.
   */
  private updateChevron(): void {
    if (!this.hasChildren) {
      this.chevronElement.style.visibility = 'hidden';
      this.chevronElement.textContent = '';
      this.chevronElement.style.transform = 'none';
      return;
    }
    this.chevronElement.style.visibility = 'visible';
    this.chevronElement.textContent = '▶';
    this.chevronElement.style.transform = this.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
  }

  /** Builds the object type icon container and fills glyph / badge. */
  private buildIcon(): void {
    this.styleCenteredSlot(this.iconElement, 14);
    this.iconElement.style.position = 'relative';
    this.iconElement.style.marginRight = '4px';
    this.iconElement.style.fontSize = '12px';
    this.iconElement.style.overflow = 'visible';
    this.styleCenteredSlot(this.iconGlyphElement, 14);
    this.iconBadgeElement.style.position = 'absolute';
    this.iconBadgeElement.style.left = '50%';
    this.iconBadgeElement.style.top = '58%';
    this.iconBadgeElement.style.transform = 'translate(-50%, -50%)';
    this.iconBadgeElement.style.pointerEvents = 'none';
    this.iconBadgeElement.style.display = 'none';
    this.iconElement.appendChild(this.iconGlyphElement);
    this.iconElement.appendChild(this.iconBadgeElement);
    this.applyIconFromObject();
  }

  /** Applies type icon character, color, and optional operation badge. */
  private applyIconFromObject(): void {
    outlinerItemApplyIconFromObject(this.object, this.iconGlyphElement, this.iconBadgeElement);
  }

  /** Builds the name text span element with dual-tone base and id suffix. */
  private buildName(): void {
    this.styleNameElementHost();
    this.styleNameBaseElement();
    this.styleNameIdElement();
    this.nameElement.appendChild(this.nameBaseElement);
    this.nameElement.appendChild(this.nameIdElement);
    this.applyNameLabelText(this.object.name);
    this.nameElement.addEventListener('dblclick', (event: MouseEvent) => {
      event.stopPropagation();
      this.startRename();
    });
  }

  /**
   * Paints the display name with a bright base and dimmer auto hex id suffix.
   *
   * @param name Object hierarchy name to show.
   */
  private applyNameLabelText(name: string): void {
    const fullName = name || 'Unnamed';
    if (parseHierarchyHexSuffix(fullName) === null) {
      this.nameBaseElement.textContent = fullName;
      this.nameIdElement.textContent = '';
      this.nameIdElement.style.display = 'none';
      return;
    }
    const baseName = extractHierarchyNameBase(fullName);
    this.nameBaseElement.textContent = baseName;
    this.nameIdElement.textContent = fullName.slice(baseName.length);
    this.nameIdElement.style.display = '';
  }

  /** Styles the outer name host used for ellipsis and flex growth. */
  private styleNameElementHost(): void {
    this.nameElement.style.flex = '1 1 0';
    this.nameElement.style.minWidth = '0';
    this.nameElement.style.maxWidth = '100%';
    this.nameElement.style.display = 'block';
    this.nameElement.style.height = '16px';
    this.nameElement.style.lineHeight = '16px';
    this.nameElement.style.overflow = 'hidden';
    this.nameElement.style.textOverflow = 'ellipsis';
    this.nameElement.style.whiteSpace = 'nowrap';
  }

  /** Styles the bright base portion of the hierarchy name. */
  private styleNameBaseElement(): void {
    this.nameBaseElement.style.color = Theme.buttonTextColor;
  }

  /** Styles the darker auto-id suffix of the hierarchy name. */
  private styleNameIdElement(): void {
    this.nameIdElement.style.color = Theme.outlinerNameIdColor;
  }

  /** Builds the visibility toggle icon element. */
  private buildVisibilityIcon(): void {
    this.styleCenteredSlot(this.visibilityElement, 16);
    this.visibilityElement.style.cursor = 'pointer';
    this.visibilityElement.style.marginLeft = '4px';
    this.visibilityElement.style.lineHeight = '0';
    this.updateVisibilityIcon();
    this.visibilityElement.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      if (this.onToggleVisibility) {
        this.onToggleVisibility(this.object);
      }
    });
  }

  /** Updates the visibility SVG icon and color for the current state. */
  private updateVisibilityIcon(): void {
    this.visibilityElement.innerHTML = this.isVisible
      ? IconOutlinerVisibility.openEye()
      : IconOutlinerVisibility.hiddenEye();
    this.visibilityElement.style.color = this.isVisible ? '#ffffff' : '#666666';
    this.visibilityElement.title = this.isVisible ? 'Hide' : 'Show';
  }

  /** Builds the lock toggle icon element. */
  private buildLockIcon(): void {
    this.styleCenteredSlot(this.lockElement, 16);
    this.lockElement.style.cursor = 'pointer';
    this.lockElement.style.marginLeft = '2px';
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

  /** Updates the lock icon character and color. */
  private updateLockIcon(): void {
    this.lockElement.textContent = this.isLocked ? '🔒' : '🔓';
    this.lockElement.style.color = this.isLocked ? '#e67e22' : '#555555';
  }

  /** Binds interaction events to the row element. */
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
   * Binds HTML5 drag-and-drop events. Visual insert feedback is owned by the
   * tree; this row only reports hover/drop coordinates.
   */
  private bindDragAndDropEvents(): void {
    this.rowElement.addEventListener('dragstart', (event: DragEvent) => {
      this.handleRowDragStart(event);
    });
    this.rowElement.addEventListener('dragend', () => {
      this.handleRowDragEnd();
    });
    this.rowElement.addEventListener('dragenter', (event: DragEvent) => {
      this.handleRowDragHover(event);
    });
    this.rowElement.addEventListener('dragover', (event: DragEvent) => {
      this.handleRowDragHover(event);
    });
    this.rowElement.addEventListener('dragleave', (event: DragEvent) => {
      this.handleRowDragLeave(event);
    });
    this.rowElement.addEventListener('drop', (event: DragEvent) => {
      this.handleRowDrop(event);
    });
  }

  /**
   * Starts a row drag and notifies the tree.
   *
   * @param event Native dragstart event.
   */
  private handleRowDragStart(event: DragEvent): void {
    event.stopPropagation();
    if (this.renameInput) {
      event.preventDefault();
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.object.uuid);
    }
    this.setDragSourceVisual(true);
    this.onDragStartCallback?.(this.object, event);
  }

  /** Ends a row drag and notifies the tree. */
  private handleRowDragEnd(): void {
    this.setDragSourceVisual(false);
    this.setIntoDropHighlight(false);
    this.onDragEndCallback?.(this.object);
  }

  /**
   * Accepts drag-over and reports hover so the tree can place the insert line.
   *
   * @param event Native dragenter/dragover event.
   */
  private handleRowDragHover(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.onDragHoverCallback?.(this.object, event);
  }

  /**
   * Clears into-highlight when the pointer leaves this row for another node.
   *
   * @param event Native dragleave event.
   */
  private handleRowDragLeave(event: DragEvent): void {
    const related = event.relatedTarget;
    if (related instanceof Node && this.rowElement.contains(related)) return;
    this.setIntoDropHighlight(false);
  }

  /**
   * Completes a drop on this row and notifies the tree.
   *
   * @param event Native drop event.
   */
  private handleRowDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.setIntoDropHighlight(false);
    this.onDropCallback?.(this.object, event);
  }
}
