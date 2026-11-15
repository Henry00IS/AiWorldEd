import type { Vector2 } from 'three';
import { Tool } from '@/editor/tools/tool.js';
import { OverlaySegmentsPreview } from '@/edit/overlay/overlay_segments_preview.js';
import type { FaceSelectionAxis } from '@/edit/topology/handler_component_mesh_operations.js';
import type { TopologyFaceInsetGrouping } from '@/edit/topology/topology_face_inset_region.js';
import { editAxisDragParameter } from './edit_axis_drag.js';
import { editPointDistanceToRay } from './edit_axis_drag_radius.js';
import { EditNumericEntry } from './edit_numeric_entry.js';

/** Value the pointer and typing currently set. */
type InsetField = 'thickness' | 'depth';

/**
 * Single-use face inset: moving the pointer away from the selected faces makes
 * the inset ring thicker. Tab switches the pointer and typing to the depth,
 * which raises or sinks the inset faces. I switches between one region and each
 * face on its own. Click or Enter confirms, Esc or right click cancels.
 */
export class EditFaceInsetTool extends Tool {
  private readonly entries: Record<InsetField, EditNumericEntry>;
  private readonly values: Record<InsetField, number>;
  private grouping: TopologyFaceInsetGrouping;
  private field: InsetField;
  private fieldStartValue: number;
  private pointerStart: number | null;
  private preview: OverlaySegmentsPreview | null;
  private axis: FaceSelectionAxis | null;
  private finished: boolean;

  /** Creates the inset tool. */
  constructor() {
    super();
    this.entries = { thickness: new EditNumericEntry(), depth: new EditNumericEntry() };
    this.values = { thickness: 0, depth: 0 };
    this.grouping = 'region';
    this.field = 'thickness';
    this.fieldStartValue = 0;
    this.pointerStart = null;
    this.preview = null;
    this.axis = null;
    this.finished = false;
  }

  /** Reads the face centre, or hands control back when nothing can inset. */
  override onActivate(): void {
    this.finished = false;
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    this.axis = operations?.describeFaceSelectionAxis('Inset Faces') ?? null;
    if (!this.axis) {
      this.returnToParentTool();
      return;
    }
    this.pointerStart = this.readPointerMeasure();
    this.publishStatus();
  }

  /** Removes the preview. */
  override onDeactivate(): void {
    this.finished = true;
    this.preview?.dispose();
    this.preview = null;
  }

  /**
   * Returns whether the inset still owns input.
   *
   * @returns True until it is confirmed or cancelled.
   */
  override isBusy(): boolean {
    return this.isSingleUse && !this.finished;
  }

  /** Follows the pointer and refreshes the preview each frame. */
  override onRender(): void {
    if (this.finished || !this.axis) return;
    const value = this.entries[this.field].resolve(this.readPointerValue());
    this.values[this.field] = this.field === 'thickness' ? Math.max(0, value) : value;
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    const segments = operations?.previewFaceInset(this.values.thickness, this.values.depth, this.grouping) ?? [];
    this.ensurePreview()?.setSegments(segments);
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
   * Routes Enter, Escape, Tab, I and number typing.
   *
   * @param keyCode Key code.
   * @param event Keyboard event.
   * @returns True when handled.
   */
  override onKeyDown(keyCode: string, event?: KeyboardEvent): boolean {
    if (this.finished) return false;
    if (keyCode === 'Enter' || keyCode === 'NumpadEnter') this.confirm();
    else if (keyCode === 'Escape') this.returnToParentTool();
    else if (keyCode === 'Tab') this.fieldSwitch(event);
    else if (keyCode === 'KeyI') this.groupingToggle();
    else return this.entries[this.field].handleKey(keyCode) || keyCode.startsWith('Shift');
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
   * Hands the pointer and typing to the other value, continuing from where that
   * value stands.
   *
   * @param event Keyboard event whose browser default is suppressed.
   */
  private fieldSwitch(event?: KeyboardEvent): void {
    event?.preventDefault();
    this.field = this.field === 'thickness' ? 'depth' : 'thickness';
    this.fieldStartValue = this.values[this.field];
    this.pointerStart = this.readPointerMeasure();
  }

  /** Switches between one region and each face on its own. */
  private groupingToggle(): void {
    this.grouping = this.grouping === 'region' ? 'individual' : 'region';
  }

  /**
   * Returns to the previous tool, then applies the inset so its result stays in
   * the status bar.
   */
  private confirm(): void {
    const operations = this.editor?.getServices()?.getEditMeshOperations?.();
    this.returnToParentTool();
    operations?.insetSelectedFaces(this.values.thickness, this.values.depth, this.grouping);
  }

  /**
   * Returns the snapped value the pointer gives the active field.
   *
   * @returns Field value from the pointer.
   */
  private readPointerValue(): number {
    const current = this.readPointerMeasure();
    if (current === null || this.pointerStart === null) {
      this.pointerStart = this.pointerStart ?? current;
      return this.values[this.field];
    }
    const raw = this.fieldStartValue + current - this.pointerStart;
    const snap = this.editor?.getServices()?.snapEditDistance;
    return snap && this.editor ? snap(raw, this.editor.isShiftPressed === true) : raw;
  }

  /**
   * Measures the pointer for the active field: distance from the face centre
   * for thickness, position along the face normal for depth.
   *
   * @returns Measure, or null when the pointer ray is unusable.
   */
  private readPointerMeasure(): number | null {
    const editor = this.editor;
    const axis = this.axis;
    const ray = editor
      ?.getServices()
      ?.readEditPointerRay?.(editor.mousePosition.x, editor.mousePosition.y, editor.lastPointerOwnerDocument);
    if (!ray || !axis) return null;
    if (this.field === 'thickness') return editPointDistanceToRay(axis.anchor, ray.origin, ray.direction);
    return editAxisDragParameter(axis.anchor, axis.direction, ray.origin, ray.direction);
  }

  /** Shows both values and the controls in the status bar. */
  private publishStatus(): void {
    const typed = (field: InsetField) => (this.entries[field].hasText() ? ` [${this.entries[field].readText()}]` : '');
    const mark = (field: InsetField) => (this.field === field ? '▸ ' : '');
    const mode = this.grouping === 'individual' ? 'Individual' : 'Region';
    this.editor
      ?.getServices()
      ?.setStatusMessage(
        `Inset Faces (${mode}): ${mark('thickness')}Thickness ${this.values.thickness.toFixed(3)}${typed('thickness')} · ${mark('depth')}Depth ${this.values.depth.toFixed(3)}${typed('depth')} · Tab switches Thickness / Depth · I toggles Individual · Shift inverts grid snap · Click or Enter confirms · Esc cancels`,
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

  /** Hands input back to the tool that started the inset. */
  private returnToParentTool(): void {
    this.finished = true;
    const parent = this.parent;
    if (this.editor && parent) this.editor.switchTool(parent);
  }
}
