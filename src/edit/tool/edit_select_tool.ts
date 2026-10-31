import type { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { TransformMode } from '@/types/transform_mode.js';
import { TranslationWidget } from '@/editor/widgets/translation_widget.js';
import { RotationWidget } from '@/editor/widgets/rotation_widget.js';
import { ScaleWidget } from '@/editor/widgets/scale_widget.js';
import { EditEdgeCutTool } from './edit_edge_cut_tool.js';
import { EditLoopCutTool } from './edit_loop_cut_tool.js';
import { openEditMergeMenu } from './edit_merge_menu.js';

/**
 * Permanent Edit Mode selection tool. Routes left-click picks into the edit
 * coordinator, keeps transform gizmos available without leaving select, and
 * launches G/R/S single-use component transforms when the component selection
 * is non-empty.
 */
export class EditSelectTool extends Tool {
  private readonly translationWidget: TranslationWidget;
  private readonly rotationWidget: RotationWidget;
  private readonly scaleWidget: ScaleWidget;
  /**
   * Hosted permanent widget mode, or null when transform widgets are toggled
   * off (Edit Mode default / press active mode again).
   */
  private hostedWidgetMode: TransformMode | null;

  /** Creates the edit select tool. */
  constructor() {
    super();
    this.translationWidget = new TranslationWidget();
    this.rotationWidget = new RotationWidget();
    this.scaleWidget = new ScaleWidget();
    this.hostedWidgetMode = null;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    this.hostedWidgetMode = null;
    this.editor?.getServices()?.setStatusMessage('Edit Mode');
    this.syncPermanentTransformWidgets();
  }

  /** Called when the tool is deactivated. */
  override onDeactivate(): void {
    this.hostedWidgetMode = null;
    this.editor?.clearWidgets();
  }

  /** Called each frame to keep the active transform widget in sync. */
  override onRender(): void {
    this.syncPermanentTransformWidgets();
    this.updateHostedWidgetVisibility();
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (button !== 0 || !this.editor) {
      return;
    }
    const services = this.editor.getServices();
    if (!services) {
      return;
    }
    services.beginEditSelectPointerDown(
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      this.editor.isShiftPressed,
      this.editor.isCtrlPressed,
      this.editor.lastPointerOwnerDocument,
    );
  }

  /**
   * Called when the tool receives a mouse up event.
   *
   * @param _button Mouse button index.
   */
  override onMouseUp(_button: number): void {}

  /**
   * Called when the tool receives a mouse move event.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Routes topology shortcuts, then launches single-use component transforms
   * with G/R/S when components are selected.
   *
   * @param keyCode Key code string.
   * @param event Optional keyboard event.
   * @returns True when handled.
   */
  override onKeyDown(keyCode: string, event?: KeyboardEvent): boolean {
    if (this.isSingleUse || !this.editor) {
      return false;
    }
    if (this.handleTopologyShortcut(keyCode, event)) {
      return true;
    }
    return this.dispatchSingleUseTransformKeys(keyCode);
  }

  /**
   * Launches single-use translate, rotate, or scale on G/R/S. Ctrl or Meta
   * combinations are left for the browser and global shortcuts.
   *
   * @param keyCode Key code string.
   * @returns True when a single-use transform was launched.
   */
  private dispatchSingleUseTransformKeys(keyCode: string): boolean {
    const editor = this.editor;
    if (!editor || editor.isCtrlPressed || editor.selectedSegmentsCount <= 0) {
      return false;
    }
    if (keyCode === 'KeyG') {
      editor.useSingleUseTranslateTool();
      return true;
    }
    if (keyCode === 'KeyR') {
      editor.useSingleUseRotateTool();
      return true;
    }
    if (keyCode === 'KeyS' && !editor.isModifierPressed) {
      editor.useSingleUseScaleTool();
      return true;
    }
    return false;
  }

  /**
   * Handles knife, loop cut (Ctrl+R without Shift or Alt, so Ctrl+Shift+R still
   * hard-reloads), merge, and dissolve keys.
   *
   * @param keyCode Key code.
   * @param event Keyboard event.
   * @returns True when handled.
   */
  private handleTopologyShortcut(keyCode: string, event?: KeyboardEvent): boolean {
    if (keyCode === 'KeyK' && !this.editor?.isModifierPressed) {
      this.editor?.useTool(new EditEdgeCutTool());
      return true;
    }
    if (keyCode === 'KeyR' && event?.ctrlKey && !event.shiftKey && !event.altKey) {
      this.editor?.useTool(new EditLoopCutTool());
      return true;
    }
    if (keyCode === 'KeyM' && !this.editor?.isModifierPressed) {
      return this.openMergeMenu();
    }
    if (keyCode === 'KeyX' && !this.editor?.isModifierPressed) {
      return this.editor?.getServices()?.deleteEditSelection?.() === true;
    }
    return false;
  }

  /**
   * Opens the merge menu at the last pointer position.
   *
   * @returns True when the menu opened.
   */
  private openMergeMenu(): boolean {
    if (!this.editor) {
      return false;
    }
    const host = this.editor.lastPointerOwnerDocument?.body ?? document.body;
    openEditMergeMenu(host, this.editor.lastPointerClientX, this.editor.lastPointerClientY, (mode) => {
      this.editor?.getServices()?.mergeEditSelection?.(mode);
    });
    return true;
  }

  /**
   * Hosts the permanent transform widget that matches the current gizmo mode.
   * Bounds mode means widgets are off (Edit Mode default / toggled off). Edit
   * Mode must stay on this tool so component picks keep receiving input.
   */
  private syncPermanentTransformWidgets(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    const mode = this.resolveHostedWidgetMode(services.getWidgetMode());
    if (this.hostedWidgetMode === mode) {
      return;
    }
    this.editor.clearWidgets();
    this.hostedWidgetMode = mode;
    this.hostWidgetForMode(mode);
    services.refreshGizmoPresentation();
  }

  /**
   * Resolves which permanent widget to host. Bounds (and unknown modes) mean no
   * widget — Edit Mode uses Bounds as the off state so the toolbar can clear.
   *
   * @param mode Gizmo mode from services.
   * @returns Widget mode to host, or null when widgets are off.
   */
  private resolveHostedWidgetMode(mode: TransformMode): TransformMode | null {
    if (mode === TransformMode.TRANSLATE || mode === TransformMode.ROTATE || mode === TransformMode.SCALE) {
      return mode;
    }
    return null;
  }

  /**
   * Adds the permanent widget for the active transform mode, or none when off.
   *
   * @param mode Hosted widget mode, or null when widgets are disabled.
   */
  private hostWidgetForMode(mode: TransformMode | null): void {
    if (!this.editor || !mode) {
      return;
    }
    if (mode === TransformMode.ROTATE) {
      this.editor.addWidget(this.rotationWidget);
      return;
    }
    if (mode === TransformMode.SCALE) {
      this.editor.addWidget(this.scaleWidget);
      return;
    }
    this.editor.addWidget(this.translationWidget);
  }

  /** Shows the hosted transform widget while components are selected. */
  private updateHostedWidgetVisibility(): void {
    if (!this.editor) {
      return;
    }
    const visible = this.editor.selectedSegmentsCount > 0 && this.hostedWidgetMode !== null;
    const position = this.editor.selectedSegmentsAveragePosition;
    this.translationWidget.visible = visible && this.hostedWidgetMode === TransformMode.TRANSLATE;
    this.rotationWidget.visible = visible && this.hostedWidgetMode === TransformMode.ROTATE;
    this.scaleWidget.visible = visible && this.hostedWidgetMode === TransformMode.SCALE;
    if (visible) {
      this.translationWidget.position.copy(position);
      this.rotationWidget.position.copy(position);
      this.scaleWidget.position.copy(position);
    }
  }
}
