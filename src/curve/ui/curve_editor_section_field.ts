import type { CurveSegment, CurveSegmentSection } from '@/curve/model/curve_model.js';
import type { CurveSectionParameter } from '@/curve/model/curve_section.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { curveEditorLabel } from './curve_editor_label.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** One standard numeric property in the section toolbar. */
export interface CurveEditorSectionFieldOptions {
  /** Stored property. */
  property: CurveSectionParameter;
  /** Caption and accessible name. */
  label: string;
  /** Sections that expose this property; absent means all sections. */
  sections?: readonly CurveSegmentSection[];
  /** Shown only for segments whose corners are cut or rounded. */
  cornered?: boolean;
  /** Initial property value. */
  fallback: number;
  /** Smallest allowed value. */
  min: number;
  /** Largest allowed value. */
  max: number;
  /** Numeric arrow step. */
  step: number;
  /** Shown decimals; 2 when absent. */
  decimals?: number;
  /** Tooltip of the caption and input, when the label alone is not enough. */
  hint?: string;
}

/** Standard numeric input with a selection captured on focus. */
export class CurveEditorSectionField {
  private readonly field;
  private readonly label: HTMLElement;
  private targets: number[] = [];

  /**
   * Binds a numeric section property to a curve session.
   *
   * @param session Editing session.
   * @param options Property metadata.
   */
  constructor(
    private readonly session: CurveEditorSession,
    private readonly options: CurveEditorSectionFieldOptions,
  ) {
    this.field = inputNumericCreateUvField(options.step, options.label);
    this.label = curveEditorLabel(options.label);
    if (options.hint) this.label.title = this.field.getElement().title = options.hint;
    this.field.bindCommit(() => this.commit());
    this.field.getElement().addEventListener('focus', () => {
      this.targets = this.session.sectionTargets();
    });
  }

  /**
   * Returns the property caption and input.
   *
   * @returns Standard toolbar elements.
   */
  elements(): HTMLElement[] {
    return [this.label, this.field.getElement()];
  }

  /** Reflects the applicable selection, preserving unfinished typed values. */
  refresh(): void {
    const segments = this.session.sectionTargets().map((index) => this.session.curve.segments[index]);
    const applicable = segments.filter((segment) => segment && this.applies(segment));
    const display = applicable.length > 0 ? '' : 'none';
    this.label.style.display = display;
    this.field.getElement().style.display = display;
    const values = applicable.map((segment) => segment?.[this.options.property] ?? this.options.fallback);
    if (!this.field.isTyping())
      this.field.setNumber(
        values.every((value) => value === values[0]) ? (values[0] ?? null) : null,
        this.options.decimals ?? 2,
      );
  }

  /**
   * Returns whether this property belongs to a segment's section.
   *
   * @param segment Selected segment.
   * @returns True when the field edits it.
   */
  private applies(segment: CurveSegment): boolean {
    const sections = this.options.sections;
    if (sections && !sections.includes(segment.section ?? 'round')) return false;
    return !this.options.cornered || !!segment.cornerSize;
  }

  /**
   * Commits typing before a press changes the graph selection.
   *
   * @param target Pressed element.
   */
  commitPending(target: EventTarget | null): void {
    const field = this.field.getElement();
    if (target === field || field.ownerDocument.activeElement !== field) return;
    if (this.field.isTyping()) this.commit();
    field.blur();
  }

  /** Applies a bounded number to the remembered selection. */
  private commit(): void {
    const value = this.field.parseNumberOrNull();
    if (value !== null)
      this.session.setSectionProperty(
        this.options.property,
        Math.max(this.options.min, Math.min(this.options.max, value)),
        this.targets,
      );
    this.refresh();
  }
}
