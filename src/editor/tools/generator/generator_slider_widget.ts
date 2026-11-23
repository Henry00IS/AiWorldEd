import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements, widgetScreenProject } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackSlider } from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { GeneratorSliderEntry } from './generator_slider_entry.js';
import {
  generatorSliderClamp,
  generatorSliderHandle,
  generatorSliderValueAt,
  generatorSliderValueText,
} from './generator_slider_value.js';

/** Pointer distance in pixels that still grabs a handle. */
const GENERATOR_SLIDER_GRAB_PX = 10;

/** Pointer travel in pixels below which a press and release is a still click. */
const GENERATOR_SLIDER_STILL_PX = 2;

/** A handle drag in progress. */
interface GeneratorSliderDrag {
  /** Key of the dragged slider. */
  key: string;
  /** Pane the drag started in. */
  pane: EditorViewportPickContext;
  /** Last value written, or null before the first move. */
  written: number | null;
  /** Client point of the press. */
  x: number;
  /** Client point of the press. */
  y: number;
}

/**
 * The slider handles of the object being edited. A handle sits where the
 * script's Shows put it; dragging writes the value under the pointer and the
 * handle follows what the script then shows. When the drag ends the input keeps
 * the value the handle shows, and the drag is one undo step; Escape during a
 * drag takes it back. A still click on a handle opens a field to type an exact
 * value, and a dashed ruler runs from the zero point to each handle.
 */
export class GeneratorSliderWidget extends Widget {
  /** Handle elements by pane and slider key. */
  private readonly handles = new WidgetScreenElements((doc) => generatorSliderElementCreate(doc));
  /** Ruler lines by pane and slider key. */
  private readonly rulers = new WidgetScreenElements((doc) => generatorSliderRulerCreate(doc));
  /** Field for typing an exact value. */
  private readonly entry = new GeneratorSliderEntry();
  /** Drag in progress, or null. */
  private drag: GeneratorSliderDrag | null = null;

  /** Places every handle and ruler of this frame and hides the rest. */
  override onRender(): void {
    const host = this.host();
    const shown = new Set<HTMLElement>();
    for (const pane of host?.panes() ?? []) {
      for (const slider of host?.sliders() ?? []) {
        const element = this.handles.place(pane, slider.key, generatorSliderHandle(slider));
        element.textContent = `${slider.label} ${generatorSliderValueText(slider.value)}`;
        element.dataset['dragging'] = String(this.drag?.key === slider.key);
        shown.add(element);
        shown.add(this.rulerPlace(pane, slider));
      }
    }
    this.handles.hideOthers(shown);
    this.rulers.hideOthers(shown);
  }

  /**
   * Lays a ruler line from a slider's zero point to its handle.
   *
   * @param pane Pane.
   * @param slider Slider.
   * @returns Ruler element.
   */
  private rulerPlace(pane: EditorViewportPickContext, slider: ModifierStackSlider): HTMLElement {
    const from = widgetScreenProject(slider.origin, pane);
    const to = widgetScreenProject(generatorSliderHandle(slider), pane);
    const element = this.rulers.get(pane.pickElement, slider.key);
    element.hidden = !from.visible || !to.visible;
    element.style.left = `${from.x}px`;
    element.style.top = `${from.y}px`;
    element.style.width = `${Math.hypot(to.x - from.x, to.y - from.y)}px`;
    element.style.transform = `rotate(${Math.atan2(to.y - from.y, to.x - from.x)}rad)`;
    return element;
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
    this.entry.close();
    const [x, y] = [editor.lastPointerClientX, editor.lastPointerClientY];
    this.drag = { key: hit.slider.key, pane: hit.pane, written: null, x, y };
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
   * A still click opens the field for typing a value instead.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    const drag = this.drag;
    const host = this.host();
    if (button !== 0 || !drag || !host) return;
    this.dragStop();
    const slider = host.sliders().find((each) => each.key === drag.key);
    if (slider && drag.written === null && this.stillSince(drag)) return this.entryOpen(host, drag, slider);
    this.slideFinish(host, drag.key, drag.written);
  }

  /**
   * Returns whether the pointer is still where a press started.
   *
   * @param drag Press.
   * @returns True within the still-click distance.
   */
  private stillSince(drag: GeneratorSliderDrag): boolean {
    const editor = this.editor;
    if (!editor) return false;
    const moved = Math.hypot(editor.lastPointerClientX - drag.x, editor.lastPointerClientY - drag.y);
    return moved <= GENERATOR_SLIDER_STILL_PX;
  }

  /**
   * Opens the typing field at a handle; Enter writes the typed value, kept
   * inside the limits, as one undo step.
   *
   * @param host Edit host.
   * @param drag Still press on the handle.
   * @param slider Slider pressed.
   */
  private entryOpen(host: GeneratorEditHost, drag: GeneratorSliderDrag, slider: ModifierStackSlider): void {
    const point = widgetScreenProject(generatorSliderHandle(slider), drag.pane);
    const text = generatorSliderValueText(slider.value);
    this.entry.open(drag.pane.pickElement.ownerDocument, point.x, point.y, slider.label, text, (value) => {
      const typed = generatorSliderClamp(slider, value);
      host.slide(slider, typed);
      this.slideFinish(host, slider.key, typed);
    });
  }

  /**
   * Ends a change: the input keeps the value the script then shows, and the
   * change becomes one undo step.
   *
   * @param host Edit host.
   * @param key Slider key.
   * @param written Last value written, or null when nothing was written.
   */
  private slideFinish(host: GeneratorEditHost, key: string, written: number | null): void {
    const slider = host.sliders().find((each) => each.key === key);
    if (slider && written !== null && slider.value !== written) host.slide(slider, slider.value);
    host.slideEnd();
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
    this.entry.close();
    this.handles.hideOthers(new Set());
    this.rulers.hideOthers(new Set());
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

/**
 * Creates a ruler line element in a document: a dashed line that turns about
 * its left end and never takes the pointer.
 *
 * @param doc Document of the pane.
 * @returns Ruler element.
 */
function generatorSliderRulerCreate(doc: Document): HTMLElement {
  const element = doc.createElement('div');
  element.dataset['ruler'] = 'true';
  Object.assign(element.style, GENERATOR_SLIDER_RULER_STYLE);
  doc.body.append(element);
  return element;
}

/** Inline style of a ruler line. */
const GENERATOR_SLIDER_RULER_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  height: '0',
  borderTop: `1px dashed ${ThemeCss.textColor}`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
  zIndex: '4',
  opacity: '0.7',
};

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
