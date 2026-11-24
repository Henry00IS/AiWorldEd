import * as THREE from 'three';
import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements, widgetScreenProject } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackAim } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { TransformModalAxis, transformModalAxisToggle } from '@/transform/modal/transform_modal_axis.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import {
  GeneratorShiftWatch,
  generatorAxisIndex,
  generatorAxisKey,
  generatorAxisUnit,
  generatorShiftHeld,
} from './generator_drag_keys.js';
import { generatorPathAxisPoint, generatorPathPlanePoint } from './generator_path_geometry.js';
import { GENERATOR_HANDLE_HOVER_COLOR, GENERATOR_HANDLE_STYLE } from './generator_handle_style.js';

/** Pointer distance in pixels that still grabs a tip. */
const GENERATOR_AIM_GRAB_PX = 10;

/** An arrow and the pane it shows in. */
interface GeneratorAimHit {
  /** Arrow. */
  aim: ModifierStackAim;
  /** Pane. */
  pane: EditorViewportPickContext;
}

/** An arrow being dragged: where its tip started and the axis it is locked to. */
interface GeneratorAimDrag extends GeneratorAimHit {
  /** Tip when the drag started. */
  anchor: THREE.Vector3;
  /** World axis the tip moves along, or none. */
  axis: TransformModalAxis;
}

/**
 * The Widget Direction arrows of the object being edited. Dragging a tip points
 * the arrow at the grid point under the pointer, on the grid plane through the
 * tip that faces the camera, as path points move; X, Y or Z moves the tip along
 * that world axis instead and Shift turns grid snapping the other way. The drag
 * is one undo step and Escape takes it back.
 */
export class GeneratorAimWidget extends Widget {
  /** Tip elements by pane and arrow key. */
  private readonly tips = new WidgetScreenElements((doc) => generatorAimElementCreate(doc, 'aimHandle'));
  /** Shaft lines by pane and arrow key. */
  private readonly shafts = new WidgetScreenElements((doc) => generatorAimElementCreate(doc, 'aimShaft'));
  /** Arrow being dragged, or null. */
  private drag: GeneratorAimDrag | null = null;
  /** Turns snapping over at once when Shift changes during a drag. */
  private readonly shift = new GeneratorShiftWatch(() => this.dragApply());

  /** Places every arrow of this frame and hides the rest. */
  override onRender(): void {
    const host = this.host();
    const hovered = this.drag ?? (host && this.editor ? this.hit(host) : null);
    const shown = new Set<HTMLElement>();
    for (const pane of host?.panes() ?? [])
      for (const aim of host?.aims() ?? []) {
        const tip = aim.origin.clone().add(aim.direction);
        const shaft = this.shafts.line(pane, aim.key, aim.origin, tip);
        shaft.style.borderTopColor = aim.color || ThemeCss.textColor;
        const element = this.tips.place(pane, aim.key, tip);
        generatorAimElementShow(element, aim, hovered?.aim.key === aim.key);
        shown.add(element).add(shaft);
      }
    if (hovered) this.editor?.setMouseCursor('move', hovered.pane.pickElement);
    this.tips.hideOthers(shown);
    this.shafts.hideOthers(shown);
  }

  /**
   * Grabs a writable tip under a left press.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    const host = this.host();
    if (button !== 0 || !host || !this.editor || this.drag) return;
    const hit = this.hit(host);
    if (!hit) return;
    const anchor = hit.aim.origin.clone().add(hit.aim.direction);
    this.drag = { ...hit, anchor, axis: TransformModalAxis.None };
    this.shift.start(this.editor, hit.pane.pickElement.ownerDocument.defaultView);
    this.latchWantsActiveFromGizmoState(true);
  }

  /** Points the dragged arrow at the pointer. */
  override onGlobalMouseDrag(): void {
    this.dragApply();
  }

  /**
   * Ends a drag as one undo step.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (button !== 0 || !this.drag) return;
    this.dragStop();
    this.host()?.changeEnd();
  }

  /**
   * Takes a drag back on Escape.
   *
   * @param keyCode Key code.
   * @returns True when a drag was cancelled.
   */
  override onKeyDown(keyCode: string): boolean {
    const axis = generatorAxisKey(keyCode);
    if (axis && this.drag) {
      this.drag.axis = transformModalAxisToggle(this.drag.axis, axis);
      this.dragApply();
      return true;
    }
    if (keyCode !== 'Escape' || !this.drag) return false;
    this.dragStop();
    this.host()?.changeCancel();
    return true;
  }

  /** Cancels a drag and hides the arrows when the tool is left. */
  override onDeactivate(): void {
    if (this.drag) this.host()?.changeCancel();
    this.dragStop();
    this.tips.hideOthers(new Set());
    this.shafts.hideOthers(new Set());
    super.onDeactivate();
  }

  /**
   * Points the dragged arrow at the grid point under the pointer, or at the
   * point along the locked axis through where its tip started.
   */
  private dragApply(): void {
    const drag = this.drag;
    const host = this.host();
    const editor = this.editor;
    const aim = drag && host?.aims().find((each) => each.key === drag.aim.key);
    if (!drag || !host || !aim || !editor) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = editor;
    const snap = (value: number): number => host.snapDistance(value, generatorShiftHeld(editor));
    const axis = generatorAxisIndex(drag.axis);
    const tip =
      axis === null
        ? generatorPathPlanePoint(drag.pane, x, y, drag.anchor, snap)
        : generatorPathAxisPoint(drag.pane, x, y, drag.anchor, generatorAxisUnit(axis, host.axisOrientation()), snap);
    const direction = tip?.sub(aim.origin);
    if (direction && direction.lengthSq() > 1e-12) host.aim(aim, direction.normalize());
  }

  /** Forgets the drag and gives the pointer back. */
  private dragStop(): void {
    this.drag = null;
    this.shift.stop();
    this.clearWantsActiveLatch();
  }

  /**
   * Finds the writable tip nearest the pointer, within grabbing distance.
   *
   * @param host Edit host.
   * @returns Arrow and its pane, or null.
   */
  private hit(host: GeneratorEditHost): GeneratorAimHit | null {
    const { lastPointerClientX: x = 0, lastPointerClientY: y = 0 } = this.editor ?? {};
    let best: (GeneratorAimHit & { distance: number }) | null = null;
    for (const pane of host.panes())
      for (const aim of host.aims()) {
        const point = widgetScreenProject(aim.origin.clone().add(aim.direction), pane);
        const distance = Math.hypot(point.x - x, point.y - y);
        if (
          aim.writes !== '' &&
          point.visible &&
          distance <= GENERATOR_AIM_GRAB_PX &&
          distance < (best?.distance ?? Infinity)
        )
          best = { aim, pane, distance };
      }
    return best && { aim: best.aim, pane: best.pane };
  }

  /**
   * Returns the edit host.
   *
   * @returns Host, or null outside the layout.
   */
  private host(): GeneratorEditHost | null {
    return this.editor?.getServices()?.getGeneratorEditHost?.() ?? null;
  }
}

/**
 * Creates a tip or shaft element in a document.
 *
 * @param doc Document of the pane.
 * @param part Data attribute that names the part.
 * @returns Element.
 */
function generatorAimElementCreate(doc: Document, part: 'aimHandle' | 'aimShaft'): HTMLElement {
  const element = doc.createElement('div');
  element.dataset[part] = 'true';
  Object.assign(element.style, part === 'aimHandle' ? GENERATOR_HANDLE_STYLE : GENERATOR_AIM_SHAFT_STYLE);
  doc.body.append(element);
  return element;
}

/**
 * Shows a tip's caption and draws its dot orange while hovered or dragged.
 *
 * @param element Tip element.
 * @param aim Arrow shown.
 * @param hover Whether the pointer is over the tip or it is dragged.
 */
function generatorAimElementShow(element: HTMLElement, aim: ModifierStackAim, hover: boolean): void {
  element.textContent = aim.label;
  element.dataset['hover'] = String(hover);
  const dot = hover ? GENERATOR_HANDLE_HOVER_COLOR : aim.color || ThemeCss.textColor;
  element.style.backgroundImage = `radial-gradient(circle at 7px 50%, ${dot} 0 5px, transparent 6px)`;
}

/** Inline style of an arrow's shaft: a solid line that never takes the pointer. */
const GENERATOR_AIM_SHAFT_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  height: '0',
  borderTop: `2px solid ${ThemeCss.textColor}`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
  zIndex: '4',
};
