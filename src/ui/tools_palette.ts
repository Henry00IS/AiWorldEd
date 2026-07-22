import { Theme } from '../theme.js';
import { hexToRgb } from '../utils/color_utils.js';
import { ToolbarIcons } from './toolbar_icons.js';
import { EditorToolId } from '../types/editor_tool_id.js';
import { FloatingPanelStack } from './floating_panel_stack.js';

/**
 * Callbacks the Tools palette uses for tool activation and clip actions.
 */
export interface ToolsPaletteHandlers {
  onSelectTool: (toolId: EditorToolId) => void;
  onFlipClipPlane: () => void;
  onCommitClip: () => void;
  onCommitSplit: () => void;
}

/**
 * Floating Photoshop-style tool palette with contextual clip controls.
 */
export class ToolsPalette {
  private root: HTMLElement;
  private host: HTMLElement;
  private handlers: ToolsPaletteHandlers;
  private defaultAnchor: HTMLElement | null;
  private isVisible: boolean;
  private activeTool: EditorToolId;
  private toolButtons: Map<EditorToolId, HTMLButtonElement>;
  private statusLabel: HTMLElement;
  private contextHeader: HTMLElement;
  private hintLabel: HTMLElement;
  private flipButton: HTMLButtonElement;
  private clipButton: HTMLButtonElement;
  private splitButton: HTMLButtonElement;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;

  /**
   * Creates a tools palette attached to the host element.
   * @param host Parent element (editor root).
   * @param handlers Tool and clip action callbacks.
   * @param defaultAnchor Element whose top-left is the default panel position.
   */
  constructor(
    host: HTMLElement,
    handlers: ToolsPaletteHandlers,
    defaultAnchor: HTMLElement | null = null
  ) {
    this.host = host;
    this.handlers = handlers;
    this.defaultAnchor = defaultAnchor;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.activeTool = EditorToolId.OBJECT;
    this.toolButtons = new Map();
    this.statusLabel = document.createElement('div');
    this.contextHeader = document.createElement('div');
    this.hintLabel = document.createElement('div');
    this.flipButton = document.createElement('button');
    this.clipButton = document.createElement('button');
    this.splitButton = document.createElement('button');
    this.root = this.buildRoot();
    this.host.appendChild(this.root);
    this.setActiveTool(EditorToolId.OBJECT);
    this.setContextStatus('Select a tool');
    this.setClipActionsEnabled(false);
  }

  /**
   * Sets the element used for the default open position.
   * @param anchor Viewport or other container element, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Shows the palette at the default anchor (top-left of the 3D viewport).
   */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the palette.
   * @param _force Kept for call-site compatibility; always hides.
   */
  hide(_force: boolean = false): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /**
   * Toggles visibility.
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide(true);
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is visible.
   * @returns True when open.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Returns the currently active tool id.
   * @returns Active EditorToolId.
   */
  getActiveTool(): EditorToolId {
    return this.activeTool;
  }

  /**
   * Updates which tool icon appears selected.
   * @param toolId Tool to highlight.
   */
  setActiveTool(toolId: EditorToolId): void {
    this.activeTool = toolId;
    this.toolButtons.forEach((button, id) => {
      this.styleToolButton(button, id === toolId);
    });
    this.contextHeader.textContent = this.formatToolTitle(toolId);
    this.hintLabel.textContent = this.formatToolHint(toolId);
  }

  /**
   * Updates the contextual status line under the tool strip.
   * @param message Status text.
   */
  setContextStatus(message: string): void {
    this.statusLabel.textContent = message;
  }

  /**
   * Enables or disables clip action buttons.
   * @param enabled Whether Flip/Clip/Split can be pressed.
   */
  setClipActionsEnabled(enabled: boolean): void {
    this.flipButton.disabled = !enabled;
    this.clipButton.disabled = !enabled;
    this.splitButton.disabled = !enabled;
    const opacity = enabled ? '1' : '0.45';
    this.flipButton.style.opacity = opacity;
    this.clipButton.style.opacity = opacity;
    this.splitButton.style.opacity = opacity;
  }

  /**
   * Disposes the palette and removes it from the DOM.
   */
  dispose(): void {
    this.hide(true);
    this.root.remove();
  }

  /**
   * Builds the root panel element.
   * @returns Styled root.
   */
  private buildRoot(): HTMLElement {
    const root = document.createElement('div');
    this.styleRoot(root);
    root.appendChild(this.buildTitleBar());
    root.appendChild(this.buildToolGrid());
    root.appendChild(this.buildContextSection());
    return root;
  }

  /**
   * Applies chrome styles to the floating panel.
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.width = '200px';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '6px';
    root.style.boxShadow = '0 8px 24px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.userSelect = 'none';
    root.style.paddingBottom = '8px';
    this.bindBringToFrontOnPointer(root);
  }

  /**
   * Raises this panel above other floating windows when the user interacts with it.
   * @param root Panel root element.
   */
  private bindBringToFrontOnPointer(root: HTMLElement): void {
    root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(root);
    });
  }

  /**
   * Builds the draggable title bar with close control.
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '6px';
    bar.style.padding = '8px 10px';
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    const title = document.createElement('span');
    title.textContent = 'Tools';
    title.style.flex = '1';
    title.style.color = Theme.buttonTextColor;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.fontFamily = 'monospace';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleSmallButton(close, false);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide(true);
    });
    bar.appendChild(title);
    bar.appendChild(close);
    this.bindDrag(bar);
    return bar;
  }

  /**
   * Builds the tool icon grid.
   * @returns Grid element.
   */
  private buildToolGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '6px';
    grid.style.padding = '8px 10px';
    this.addToolButton(grid, EditorToolId.OBJECT, 'Object', ToolbarIcons.toolObjectSelect());
    this.addToolButton(grid, EditorToolId.FACE, 'Face', ToolbarIcons.toolFaceSelect());
    this.addToolButton(grid, EditorToolId.CLIP_PLANE, 'Clip', ToolbarIcons.toolClipPlane());
    return grid;
  }

  /**
   * Adds one tool button to the grid.
   * @param grid Parent grid.
   * @param toolId Tool identifier.
   * @param title Tooltip label.
   * @param svgIcon SVG markup.
   */
  private addToolButton(
    grid: HTMLElement,
    toolId: EditorToolId,
    title: string,
    svgIcon: string
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = svgIcon;
    button.style.width = '100%';
    button.style.height = '34px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.handlers.onSelectTool(toolId);
    });
    this.toolButtons.set(toolId, button);
    this.styleToolButton(button, false);
    grid.appendChild(button);
  }

  /**
   * Styles a tool button active or idle state.
   * @param button Button element.
   * @param active Whether the tool is selected.
   */
  private styleToolButton(button: HTMLButtonElement, active: boolean): void {
    button.style.border = active
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : `1px solid ${Theme.inputBorderColor}`;
    button.style.background = active
      ? 'rgba(232, 106, 23, 0.28)'
      : hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
  }

  /**
   * Builds the contextual status and clip action section.
   * @returns Context section element.
   */
  private buildContextSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '4px 10px 0';
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '6px';
    this.contextHeader.style.color = Theme.buttonTextColor;
    this.contextHeader.style.fontFamily = 'monospace';
    this.contextHeader.style.fontSize = '11px';
    this.contextHeader.style.fontWeight = '600';
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontFamily = 'monospace';
    this.statusLabel.style.fontSize = '10px';
    this.hintLabel.style.color = Theme.statusBarTextColor;
    this.hintLabel.style.fontFamily = 'monospace';
    this.hintLabel.style.fontSize = '10px';
    section.appendChild(this.contextHeader);
    section.appendChild(this.statusLabel);
    section.appendChild(this.buildActionRow());
    section.appendChild(this.hintLabel);
    return section;
  }

  /**
   * Builds Flip / Clip / Split action buttons.
   * @returns Action row element.
   */
  private buildActionRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    this.configureActionButton(this.flipButton, 'Flip', () => {
      this.handlers.onFlipClipPlane();
    });
    this.configureActionButton(this.clipButton, 'Clip', () => {
      this.handlers.onCommitClip();
    });
    this.configureActionButton(this.splitButton, 'Split', () => {
      this.handlers.onCommitSplit();
    });
    row.appendChild(this.flipButton);
    row.appendChild(this.clipButton);
    row.appendChild(this.splitButton);
    return row;
  }

  /**
   * Configures a contextual action button.
   * @param button Button element.
   * @param label Visible label.
   * @param onClick Click handler.
   */
  private configureActionButton(
    button: HTMLButtonElement,
    label: string,
    onClick: () => void
  ): void {
    button.type = 'button';
    button.textContent = label;
    button.style.flex = '1';
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '4px 0';
    button.style.cursor = 'pointer';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  /**
   * Formats the context header for a tool.
   * @param toolId Active tool.
   * @returns Display title.
   */
  private formatToolTitle(toolId: EditorToolId): string {
    if (toolId === EditorToolId.FACE) return 'Active: Face Select';
    if (toolId === EditorToolId.CLIP_PLANE) return 'Active: Clip Plane';
    return 'Active: Object Select';
  }

  /**
   * Formats shortcut hints for a tool.
   * @param toolId Active tool.
   * @returns Hint text.
   */
  private formatToolHint(toolId: EditorToolId): string {
    if (toolId === EditorToolId.CLIP_PLANE) {
      return 'F flip · Enter clip · X split · Esc cancel';
    }
    if (toolId === EditorToolId.FACE) {
      return 'Click faces · E extrude · Tab object';
    }
    return 'Click objects · Tab face mode';
  }

  /**
   * Styles a small title-bar button.
   * @param button Button element.
   * @param active Whether it appears active.
   */
  private styleSmallButton(button: HTMLButtonElement, active: boolean): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = active
      ? 'rgba(232, 106, 23, 0.28)'
      : hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '2px 6px';
    button.style.cursor = 'pointer';
  }

  /**
   * Positions the panel at the top-left of the default anchor (3D viewport).
   * Sits just below the viewport toolbar strip with a small inset.
   */
  private positionDefault(): void {
    const paddingPx = 8;
    const anchor = this.defaultAnchor ?? this.host;
    const rect = anchor.getBoundingClientRect();
    const topInset = this.defaultAnchor
      ? Theme.viewportToolbarHeightPx + paddingPx
      : paddingPx;
    this.root.style.left = `${rect.left + paddingPx}px`;
    this.root.style.top = `${rect.top + topInset}px`;
    this.root.style.right = 'auto';
  }

  /**
   * Binds title-bar drag movement.
   * @param bar Title bar element.
   */
  private bindDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'BUTTON') return;
      this.isDragging = true;
      const rect = this.root.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      const onMove = (moveEvent: PointerEvent) => {
        if (!this.isDragging) return;
        this.root.style.left = `${moveEvent.clientX - this.dragOffsetX}px`;
        this.root.style.top = `${moveEvent.clientY - this.dragOffsetY}px`;
      };
      const onUp = () => {
        this.isDragging = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
