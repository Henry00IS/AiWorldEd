import * as THREE from 'three';
import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements, widgetScreenProject } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackAim } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { generatorPointerRay } from './generator_path_geometry.js';
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

/**
 * The Widget Direction arrows of the object being edited. Dragging a tip points
 * the arrow at the pointer, on the plane through the tip that faces the view;
 * the drag is one undo step and Escape takes it back.
 */
export class GeneratorAimWidget extends Widget {
  /** Tip elements by pane and arrow key. */
  private readonly tips = new WidgetScreenElements((doc) => generatorAimElementCreate(doc, 'aimHandle'));
  /** Shaft lines by pane and arrow key. */
  private readonly shafts = new WidgetScreenElements((doc) => generatorAimElementCreate(doc, 'aimShaft'));
  /** Arrow being dragged, or null. */
  private drag: GeneratorAimHit | null = null;

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
    this.drag = this.hit(host);
    if (this.drag) this.latchWantsActiveFromGizmoState(true);
  }

  /** Points the dragged arrow at the pointer. */
  override onGlobalMouseDrag(): void {
    const drag = this.drag;
    const host = this.host();
    const aim = drag && host?.aims().find((each) => each.key === drag.aim.key);
    if (!drag || !host || !aim || !this.editor) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = this.editor;
    const direction = generatorAimDirectionAt(aim, drag.pane, x, y);
    if (direction) host.aim(aim, direction);
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

  /** Forgets the drag and gives the pointer back. */
  private dragStop(): void {
    this.drag = null;
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
 * Returns the world direction from an arrow's start to where the pointer ray
 * meets the plane through its tip that faces the view.
 *
 * @param aim Arrow.
 * @param pane Pane the pointer is over.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Unit direction, or null when the pointer is on the start.
 */
function generatorAimDirectionAt(
  aim: ModifierStackAim,
  pane: EditorViewportPickContext,
  clientX: number,
  clientY: number,
): THREE.Vector3 | null {
  const facing = pane.camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, aim.origin.clone().add(aim.direction));
  const hit = generatorPointerRay(pane, clientX, clientY).intersectPlane(plane, new THREE.Vector3());
  const direction = hit?.sub(aim.origin);
  return direction && direction.lengthSq() > 1e-12 ? direction.normalize() : null;
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
