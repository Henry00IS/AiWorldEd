import type { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { OverlaySegmentsPreview } from '@/edit/overlay/overlay_segments_preview.js';
import type { FaceExtrudeAxis } from '@/edit/topology/handler_component_mesh_operations.js';
import type { TopologyFaceExtrudeGrouping } from '@/edit/topology/topology_face_extrude.js';
import { editAxisDragParameter } from './edit_axis_drag.js';
import { EditNumericEntry } from './edit_numeric_entry.js';

/**
 * Single-use face extrude: the selected mesh faces follow the pointer along
 * their normal. Moving behind the faces pushes them into the mesh. Typing a
 * number sets the distance exactly, minus flips it, Shift inverts grid snap,
 * click or Enter confirms and Esc or right click cancels.
 */
export class EditFaceExtrudeTool extends Tool {
  private readonly grouping: TopologyFaceExtrudeGrouping;
  private readonly numericEntry: EditNumericEntry;
  private preview: OverlaySegmentsPreview | null;
  private axis: FaceExtrudeAxis | null;
  private pointerStart: number | null;
  private distance: number;
  private finished: boolean;

  /**
   * Creates the extrude tool.
   *
   * @param grouping Whether touching faces move together or one by one.
   */
  constructor(grouping: TopologyFaceExtrudeGrouping = 'region') {
    super();
    this.grouping = grouping;
    this.numericEntry = new EditNumericEntry();
    this.preview = null;
    this.axis = null;
    this.pointerStart = null;
    this.distance = 0;
    this.finished = false;
  }

  /** Reads the drag axis, or hands control back when nothing can extrude. */
  override onActivate(): void {
    this.finished = false;
    this.axis = this.editor?.getServices()?.getEditMeshOperations?.()?.describeFaceExtrudeAxis() ?? null;
    if (!this.axis) {
      this.returnToParentTool();
      return;
    }
    this.pointerStart = this.readPointerParameter();
    this.publishStatus();
  }

  /** Removes the preview. */
  override onDeactivate(): void {
    this.finished = true;
    this.preview?.dispose();
    this.preview = null;
  }

  /**
   * Returns whether the extrude still owns input.
   *
   * @returns True until it is confirmed or cancelled.
   */
  override isBusy(): boolean {
    return this.isSingleUse && !this.finished;
  }

  /** Follows the pointer and refreshes the preview each frame. */
  override onRender(): void {
    if (this.finished || !this.axis) return;
    this.distance = this.numericEntry.resolve(this.readPointerDistance());
    this.ensurePreview()?.setSegments(
      this.editor?.getServices()?.getEditMeshOperations?.()?.previewFaceExtrude(this.distance, this.grouping) ?? [],
    );
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
    if (keyCode === 'Enter' || keyCode === 'NumpadEnter') {
      this.confirm();
      return true;
    }
    if (keyCode === 'Escape') {
      this.returnToParentTool();
      return true;
    }
    return this.numericEntry.handleKey(keyCode) || this.isShiftKey(keyCode);
  }

  /**
   * Unused; the pointer is sampled each frame.
   *
   * @param _screenDelta Screen delta.
   * @param _gridDelta Grid delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Returns whether a key is Shift, which only changes snapping.
   *
   * @param keyCode Key code.
   * @returns True for either Shift key.
   */
  private isShiftKey(keyCode: string): boolean {
    return keyCode === 'ShiftLeft' || keyCode === 'ShiftRight';
  }

  /**
   * Returns to the previous tool, then applies the extrusion so its result
   * stays in the status bar.
   */
  private confirm(): void {
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    this.returnToParentTool();
    operations?.extrudeSelectedFaces(this.distance, this.grouping);
  }

  /**
   * Returns the snapped pointer distance from where the drag started.
   *
   * @returns Distance along the axis.
   */
  private readPointerDistance(): number {
    const current = this.readPointerParameter();
    if (current === null || this.pointerStart === null) {
      this.pointerStart = this.pointerStart ?? current;
      return this.distance;
    }
    const raw = current - this.pointerStart;
    const snap = this.editor?.getServices()?.snapEditDistance;
    return snap && this.editor ? snap(raw, this.editor.isShiftPressed === true) : raw;
  }

  /**
   * Projects the pointer onto the drag axis.
   *
   * @returns Axis parameter, or null when the pointer ray is unusable.
   */
  private readPointerParameter(): number | null {
    const editor = this.editor;
    const axis = this.axis;
    const ray = editor
      ?.getServices()
      ?.readEditPointerRay?.(editor.mousePosition.x, editor.mousePosition.y, editor.lastPointerOwnerDocument);
    if (!ray || !axis) return null;
    return editAxisDragParameter(axis.anchor, axis.direction, ray.origin, ray.direction);
  }

  /** Shows the distance and the controls in the status bar. */
  private publishStatus(): void {
    const typed = this.numericEntry.hasText() ? ` [${this.numericEntry.readText()}]` : '';
    const label = this.grouping === 'individual' ? 'Extrude Faces Individually' : 'Extrude Faces';
    this.editor
      ?.getServices()
      ?.setStatusMessage(
        `${label}: ${this.distance.toFixed(3)}${typed} · move or type a distance, minus flips · Shift inverts grid snap · Click or Enter confirms · Esc cancels`,
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

  /** Hands input back to the tool that started the extrude. */
  private returnToParentTool(): void {
    this.finished = true;
    const parent = this.parent;
    if (this.editor && parent) this.editor.switchTool(parent);
  }
}
