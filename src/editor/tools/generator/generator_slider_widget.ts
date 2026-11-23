import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements, widgetScreenProject } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { generatorSliderHandle, generatorSliderValueAt } from './generator_slider_value.js';

/** Pointer distance in pixels that still grabs a handle. */
const GENERATOR_SLIDER_GRAB_PX = 10;

/** A handle drag in progress. */
interface GeneratorSliderDrag {
  /** Key of the dragged slider. */
  key: string;
  /** Pane the drag started in. */
  pane: EditorViewportPickContext;
  /** Last value written, or null before the first move. */
  written: number | null;
}

/**
 * The slider handles of the object being edited. A handle sits where the
 * script's Shows put it; dragging writes the value under the pointer and the
 * handle follows what the script then shows. When the drag ends the input keeps
 * the value the handle shows, and the drag is one undo step; Escape during a
 * drag takes it back.
 */
export class GeneratorSliderWidget extends Widget {
  /** Handle elements by pane and slider key. */
  private readonly handles = new WidgetScreenElements((doc) => generatorSliderElementCreate(doc));
  /** Drag in progress, or null. */
  private drag: GeneratorSliderDrag | null = null;

  /** Places every handle of this frame and hides the rest. */
  override onRender(): void {
    const host = this.host();
    const shown = new Set<HTMLElement>();
    for (const pane of host?.panes() ?? []) {
      for (const slider of host?.sliders() ?? []) {
        const element = this.handles.place(pane, slider.key, generatorSliderHandle(slider));
        element.textContent = slider.label;
        element.title = `${slider.label}: ${Number(slider.value.toFixed(4))}`;
        element.dataset['dragging'] = String(this.drag?.key === slider.key);
        shown.add(element);
      }
    }
    this.handles.hideOthers(shown);
  }

  /**
   * Grabs a writable handle under a left press.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    const editor = this.editor;
    const host = this.host();
    if (button !== 0 || !editor || !host || this.drag) return;
    const hit = generatorSliderHit(host, editor.lastPointerClientX, editor.lastPointerClientY);
    if (!hit) return;
    this.drag = { key: hit.slider.key, pane: hit.pane, written: null };
    this.latchWantsActiveFromGizmoState(true);
  }

  /** Writes the value under the pointer while a handle is dragged. */
  override onGlobalMouseDrag(): void {
    const drag = this.drag;
    const host = this.host();
    const slider = drag ? host?.sliders().find((each) => each.key === drag.key) : undefined;
    if (!drag || !host || !slider || !this.editor) return;
    const { lastPointerClientX: x, lastPointerClientY: y } = this.editor;
    const value = generatorSliderValueAt(slider, drag.pane, x, y, (distance) => host.snapDistance(distance));
    if (value === null || value === drag.written) return;
    drag.written = value;
    host.slide(slider, value);
  }

  /**
   * Ends a drag: the input keeps the value the script showed, as one undo step.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const drag = this.drag;
    const host = this.host();
    if (button !== 0 || !drag) return;
    this.dragStop();
    const slider = host?.sliders().find((each) => each.key === drag.key);
    if (host && slider && drag.written !== null && slider.value !== drag.written) host.slide(slider, slider.value);
    host?.slideEnd();
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
    this.host()?.slideCancel();
    return true;
  }

  /** Cancels a drag and hides the handles when the tool is left. */
  override onDeactivate(): void {
    if (this.drag) this.host()?.slideCancel();
    this.dragStop();
    this.handles.hideOthers(new Set());
    super.onDeactivate();
  }

  /** Forgets the drag and gives the pointer back. */
  private dragStop(): void {
    this.drag = null;
    this.clearWantsActiveLatch();
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
 * Finds the writable handle nearest a client point, within grabbing distance.
 *
 * @param host Edit host.
 * @param clientX Pointer client X.
 * @param clientY Pointer client Y.
 * @returns Slider and its pane, or null.
 */
function generatorSliderHit(
  host: GeneratorEditHost,
  clientX: number,
  clientY: number,
): { slider: ModifierStackSlider; pane: EditorViewportPickContext } | null {
  let best: { slider: ModifierStackSlider; pane: EditorViewportPickContext; distance: number } | null = null;
  for (const pane of host.panes()) {
    for (const slider of host.sliders()) {
      if (slider.writes === '') continue;
      const point = widgetScreenProject(generatorSliderHandle(slider), pane);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      if (point.visible && distance <= GENERATOR_SLIDER_GRAB_PX && (!best || distance < best.distance))
        best = { slider, pane, distance };
    }
  }
  return best;
}

/**
 * Creates a handle element in a document: a dot with its caption beside it,
 * which never takes the pointer.
 *
 * @param doc Document of the pane.
 * @returns Handle element.
 */
function generatorSliderElementCreate(doc: Document): HTMLElement {
  const element = doc.createElement('div');
  element.setAttribute('role', 'slider');
  Object.assign(element.style, GENERATOR_SLIDER_STYLE);
  doc.body.append(element);
  return element;
}

/** Inline style of a slider handle. */
const GENERATOR_SLIDER_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  transform: 'translate(-7px, -50%)',
  pointerEvents: 'none',
  zIndex: '5',
  paddingLeft: '18px',
  backgroundImage: `radial-gradient(circle at 7px 50%, ${ThemeCss.textColor} 0 5px, transparent 6px)`,
  backgroundRepeat: 'no-repeat',
  color: ThemeCss.textColor,
  font: '12px sans-serif',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
