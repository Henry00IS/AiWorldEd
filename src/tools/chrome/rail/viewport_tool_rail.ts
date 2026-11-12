import { Theme } from '@/theme.js';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { toolInstructionForEditorTool } from '@/tools/chrome/instruction/tool_instruction_catalog.js';
import { createViewportToolRailButton, styleViewportToolRailButton } from './viewport_tool_rail_button.js';

/** Callbacks from the floating tool rail. */
export interface ViewportToolRailHandlers {
  onSelectTool: (toolId: EditorToolId) => void;
}

/**
 * Shape Editor–style floating tool strip: primary tools only, fixed content
 * height, offset from the top-left below the options bar. Visibility is
 * controlled by the chrome host (hover-only).
 */
export class ViewportToolRail {
  private readonly root: HTMLElement;
  private readonly toolButtons: Map<EditorToolId, HTMLButtonElement>;
  private handlers: ViewportToolRailHandlers;
  private activeTool: EditorToolId;

  /**
   * Creates a floating tool rail under the pane container.
   *
   * @param parentElement Pane host element.
   * @param handlers Tool selection callbacks.
   */
  constructor(parentElement: HTMLElement, handlers: ViewportToolRailHandlers) {
    this.root = parentElement.ownerDocument.createElement('div');
    this.toolButtons = new Map();
    this.handlers = handlers;
    this.activeTool = EditorToolId.OBJECT;
    this.styleRoot();
    this.buildButtons();
    parentElement.appendChild(this.root);
    this.setActiveTool(EditorToolId.OBJECT);
    this.setVisible(false);
  }

  /**
   * Replaces tool selection handlers.
   *
   * @param handlers New handlers.
   */
  setHandlers(handlers: ViewportToolRailHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Highlights the active tool icon.
   *
   * @param toolId Active tool id.
   */
  setActiveTool(toolId: EditorToolId): void {
    this.activeTool = toolId;
    this.toolButtons.forEach((button, id) => {
      styleViewportToolRailButton(button, id === toolId);
    });
  }

  /**
   * Shows or hides individual tool buttons (e.g. hide Face/Clip in Edit Mode).
   *
   * @param toolId Tool id.
   * @param visible True to show the button.
   */
  setToolButtonVisible(toolId: EditorToolId, visible: boolean): void {
    const button = this.toolButtons.get(toolId);
    if (!button) {
      return;
    }
    button.style.display = visible ? '' : 'none';
  }

  /**
   * Shows or hides the floating rail (hover-owned pane only).
   *
   * @param visible True when this pane owns hover.
   */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Returns the rail root element.
   *
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Removes the rail from the DOM. */
  dispose(): void {
    this.root.remove();
    this.toolButtons.clear();
  }

  /** Repaints the floating tool rail and its buttons for the active theme. */
  refreshThemeChrome(): void {
    this.applyFloatingRailChrome();
    this.toolButtons.forEach((button, toolId) => {
      styleViewportToolRailButton(button, toolId === this.activeTool);
    });
  }

  /**
   * Floating panel: content-sized height, offset from top-left below the title
   * and content-sized options bar.
   */
  private styleRoot(): void {
    this.root.classList.add('editor-viewport-tool-rail');
    this.applyFloatingRailPosition();
    this.applyFloatingRailChrome();
  }

  /** Places the rail under the title toolbar and options strip. */
  private applyFloatingRailPosition(): void {
    const top =
      Theme.viewportToolbarHeightPx +
      Theme.viewportToolFloatingOffsetTopPx +
      Theme.viewportToolOptionsBarHeightPx +
      Theme.viewportToolFloatingOffsetTopPx;
    this.root.style.position = 'absolute';
    this.root.style.left = `${Theme.viewportToolFloatingOffsetLeftPx}px`;
    this.root.style.top = `${top}px`;
    this.root.style.width = `${Theme.viewportToolFloatingWidthPx}px`;
    this.root.style.height = 'auto';
  }

  /** Applies floating-panel chrome for the tool rail. */
  private applyFloatingRailChrome(): void {
    const palette = getActiveUiThemePalette();
    this.root.style.display = 'none';
    this.root.style.flexDirection = 'column';
    this.root.style.alignItems = 'center';
    this.root.style.gap = '4px';
    this.root.style.padding = '6px';
    this.root.style.boxSizing = 'border-box';
    this.root.style.background = palette.propertiesPanelBackground;
    this.root.style.border = `1px solid ${palette.panelBorderColor}`;
    this.root.style.borderRadius = '8px';
    this.root.style.boxShadow = palette.menuBoxShadow;
    this.root.style.zIndex = String(UiStackLayers.viewportChrome + 1);
    this.root.style.pointerEvents = 'auto';
  }

  /** Builds Object / Face / Clip / Grid / Paint rail buttons. */
  private buildButtons(): void {
    this.addToolButton(EditorToolId.OBJECT, ToolbarIcons.toolObjectSelect());
    this.addToolButton(EditorToolId.FACE, ToolbarIcons.toolFaceSelect());
    this.addToolButton(EditorToolId.CLIP_PLANE, ToolbarIcons.toolClipPlane());
    this.addToolButton(EditorToolId.GRID, ToolbarIcons.toolGrid());
    this.addToolButton(EditorToolId.PAINT, ToolbarIcons.toolPaint());
  }

  /**
   * Appends one primary tool button.
   *
   * @param toolId Tool id.
   * @param svgIcon Icon markup.
   */
  private addToolButton(toolId: EditorToolId, svgIcon: string): void {
    const instruction = toolInstructionForEditorTool(toolId);
    const button = createViewportToolRailButton(svgIcon, instruction, () => {
      this.handlers.onSelectTool(toolId);
    });
    this.toolButtons.set(toolId, button);
    this.root.appendChild(button);
  }
}
