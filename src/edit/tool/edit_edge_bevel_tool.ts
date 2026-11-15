import type { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { OverlaySegmentsPreview } from '@/edit/overlay/overlay_segments_preview.js';
import type { FaceSelectionAxis } from '@/edit/topology/handler_component_mesh_operations.js';
import { editPointDistanceToRay } from './edit_axis_drag_radius.js';
import { EditNumericEntry } from './edit_numeric_entry.js';

/**
 * Single-use edge bevel: moving the pointer away from the selected edges widens
 * the chamfer. Typing sets the width. Click or Enter confirms, Esc or right
 * click cancels.
 */
export class EditEdgeBevelTool extends Tool {
  private readonly numericEntry: EditNumericEntry;
  private width: number;
  private pointerStart: number | null;
  private preview: OverlaySegmentsPreview | null;
  private axis: FaceSelectionAxis | null;
  private finished: boolean;

  /** Creates the bevel tool. */
  constructor() {
    super();
    this.numericEntry = new EditNumericEntry();
    this.width = 0;
    this.pointerStart = null;
    this.preview = null;
    this.axis = null;
    this.finished = false;
  }

  /** Reads the edge centre, or hands control back when nothing can bevel. */
  override onActivate(): void {
    this.finished = false;
    this.axis = this.editor?.getServices()?.getEditMeshOperations?.()?.describeEdgeBevelCentre() ?? null;
    if (!this.axis) {
      this.returnToParentTool();
      return;
    }
    this.pointerStart = this.readPointerDistance();
    this.publishStatus();
  }

  /** Removes the preview. */
  override onDeactivate(): void {
    this.finished = true;
    this.preview?.dispose();
    this.preview = null;
  }

  /**
   * Returns whether the bevel still owns input.
   *
   * @returns True until it is confirmed or cancelled.
   */
  override isBusy(): boolean {
    return this.isSingleUse && !this.finished;
  }

  /** Follows the pointer and refreshes the preview each frame. */
  override onRender(): void {
    if (this.finished || !this.axis) return;
    this.width = Math.max(0, this.numericEntry.resolve(this.readPointerWidth()));
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    this.ensurePreview()?.setSegments(operations?.previewEdgeBevel(this.width) ?? []);
    this.publishStatus();
  }

  /**
   * Confirms on left click and cancels on right click.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (this.finished) return;
    if (button === 0) this.confirm();
    if (button === 2) this.returnToParentTool();
  }

  /**
   * Routes Enter, Escape and number typing.
   *
   * @param keyCode Key code.
   * @param _event Keyboard event.
   * @returns True when handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (this.finished) return false;
    if (keyCode === 'Enter' || keyCode === 'NumpadEnter') this.confirm();
    else if (keyCode === 'Escape') this.returnToParentTool();
    else return this.numericEntry.handleKey(keyCode) || keyCode.startsWith('Shift');
    return true;
  }

  /**
   * Unused; the pointer is sampled each frame.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Returns to the previous tool, then bevels so the result stays in the status
   * bar.
   */
  private confirm(): void {
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    this.returnToParentTool();
    operations?.bevelSelectedEdges(this.width);
  }

  /**
   * Returns the snapped width the pointer gives.
   *
   * @returns Width from the pointer.
   */
  private readPointerWidth(): number {
    const current = this.readPointerDistance();
    if (current === null || this.pointerStart === null) {
      this.pointerStart = this.pointerStart ?? current;
      return this.width;
    }
    const raw = current - this.pointerStart;
    const snap = this.editor?.getServices()?.snapEditDistance;
    return snap && this.editor ? snap(raw, this.editor.isShiftPressed === true) : raw;
  }

  /**
   * Measures how far the pointer ray passes from the edge centre.
   *
   * @returns Distance, or null when the pointer ray is unusable.
   */
  private readPointerDistance(): number | null {
    const editor = this.editor;
    const ray = editor
      ?.getServices()
      ?.readEditPointerRay?.(editor.mousePosition.x, editor.mousePosition.y, editor.lastPointerOwnerDocument);
    if (!ray || !this.axis) return null;
    return editPointDistanceToRay(this.axis.anchor, ray.origin, ray.direction);
  }

  /** Shows the width and the controls in the status bar. */
  private publishStatus(): void {
    const typed = this.numericEntry.hasText() ? ` [${this.numericEntry.readText()}]` : '';
    this.editor
      ?.getServices()
      ?.setStatusMessage(
        `Bevel Edges: Width ${this.width.toFixed(3)}${typed} · move away from the edges or type a width · Shift inverts grid snap · Click or Enter confirms · Esc cancels`,
      );
  }

  /**
   * Ensures the preview exists.
   *
   * @returns Preview, or null without an overlay scene.
   */
  private ensurePreview(): OverlaySegmentsPreview | null {
    if (this.preview) return this.preview;
    const scene = this.editor?.getServices()?.getPrimaryScene?.();
    this.preview = scene ? new OverlaySegmentsPreview(scene) : null;
    return this.preview;
  }

  /** Hands input back to the tool that started the bevel. */
  private returnToParentTool(): void {
    this.finished = true;
    const parent = this.parent;
    if (this.editor && parent) this.editor.switchTool(parent);
  }
}
