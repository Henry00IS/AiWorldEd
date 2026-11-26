import { Widget } from '@/editor/widgets/widget.js';
import { WidgetScreenElements } from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { ModifierStackDraw } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';

/**
 * The Debug drawings of the selected object: solid lines and text over the
 * panes, which never take the pointer.
 */
export class GeneratorDrawWidget extends Widget {
  /** Line elements by pane and key. */
  private readonly lines = new WidgetScreenElements((doc) => generatorDrawCreate(doc, 'line'));
  /** Text elements by pane and key. */
  private readonly texts = new WidgetScreenElements((doc) => generatorDrawCreate(doc, 'text'));

  /** Places every line and text of this frame and hides the rest. */
  override onRender(): void {
    const host = this.editor?.getServices()?.getGeneratorEditHost?.() ?? null;
    const shown = new Set<HTMLElement>();
    for (const pane of host?.panes() ?? []) for (const draw of host?.draws() ?? []) this.drawShow(pane, draw, shown);
    this.lines.hideOthers(shown);
    this.texts.hideOthers(shown);
  }

  /** Hides the drawings when the tool is left. */
  override onDeactivate(): void {
    this.lines.hideOthers(new Set());
    this.texts.hideOthers(new Set());
    super.onDeactivate();
  }

  /**
   * Shows one drawing in one pane.
   *
   * @param pane Pane.
   * @param draw Drawing.
   * @param shown Collects the elements shown this frame.
   */
  private drawShow(pane: EditorViewportPickContext, draw: ModifierStackDraw, shown: Set<HTMLElement>): void {
    const color = draw.color || ThemeCss.textColor;
    draw.segments.forEach(([from, to], index) => {
      const line = this.lines.line(pane, `${draw.key}:${index}`, from, to);
      line.style.borderTopColor = color;
      shown.add(line);
    });
    if (draw.label === '') return;
    const text = this.texts.place(pane, draw.key, draw.at);
    text.textContent = draw.label;
    text.style.color = color;
    shown.add(text);
  }
}

/**
 * Creates a line or text element of a drawing in a document.
 *
 * @param doc Document of the pane.
 * @param kind Line or text.
 * @returns Element.
 */
function generatorDrawCreate(doc: Document, kind: 'line' | 'text'): HTMLElement {
  const element = doc.createElement('div');
  element.dataset[kind === 'line' ? 'debugLine' : 'debugText'] = 'true';
  Object.assign(element.style, kind === 'line' ? GENERATOR_DRAW_LINE_STYLE : GENERATOR_DRAW_TEXT_STYLE);
  doc.body.append(element);
  return element;
}

/** Inline style of a drawn line. */
const GENERATOR_DRAW_LINE_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  height: '0',
  borderTop: `1.5px solid ${ThemeCss.textColor}`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
  zIndex: '3',
};

/** Inline style of drawn text. */
const GENERATOR_DRAW_TEXT_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  zIndex: '3',
  font: '12px sans-serif',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  textShadow: `0 0 3px ${ThemeCss.backdropAlpha(0.8)}`,
};
