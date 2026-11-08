import { curveEditorLabel } from './curve_editor_label.js';
import type { CurveSegmentSection } from '@/curve/model/curve_model.js';
import { InputSelect } from '@/ui/input/input_select.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** Standard section picker and fillet field for the curve editor selection. */
export class CurveEditorSectionControls {
  private readonly select = new InputSelect(
    [
      { value: 'round', label: 'Round' },
      { value: 'square', label: 'Square' },
      { value: 'rounded_square', label: 'Rounded square' },
    ],
    'Section',
  );
  private readonly radius: InputNumeric = inputNumericCreateUvField(0.05, 'Corner radius');
  private readonly sectionLabel = curveEditorLabel('Section');
  private readonly radiusLabel = curveEditorLabel('Corner radius');
  private targets: number[] = [];

  /**
   * Binds standard controls to the selected curve segments.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    Object.assign(this.select.getElement().style, { width: '126px', flexShrink: '0' });
    this.select.bindCommit(() => this.session.setSection(this.select.getValue() as CurveSegmentSection));
    this.radius.bindCommit(() => this.commitRadius());
    this.radius.getElement().addEventListener('focus', () => {
      this.targets = this.session.sectionTargets();
    });
    this.radius.getElement().title =
      'Corner radius / half-width (0 = Square, 1 = Round). More Sides give smoother corners.';
  }

  /**
   * Returns controls and captions in toolbar order.
   *
   * @returns Toolbar elements.
   */
  elements(): HTMLElement[] {
    return [this.sectionLabel, this.select.getElement(), this.radiusLabel, this.radius.getElement()];
  }

  /** Shows the shared section and radius, with mixed selections left blank. */
  refresh(): void {
    const targets = this.session.sectionTargets();
    const sections = targets.map((index) => this.session.curve.segments[index]?.section ?? 'round');
    this.select.setSharedValues(sections);
    this.select.getElement().disabled = targets.length === 0;
    const rounded = sections.includes('rounded_square');
    this.radiusLabel.style.display = rounded ? '' : 'none';
    this.radius.getElement().style.display = rounded ? '' : 'none';
    const radii = targets.map((index) => this.session.curve.segments[index]?.cornerRadius ?? 0.25);
    if (!this.radius.isTyping())
      this.radius.setNumber(radii.every((value) => value === radii[0]) ? (radii[0] ?? null) : null, 2);
  }

  /**
   * Commits typed radius before a graph press can change selection.
   *
   * @param target Pressed element.
   */
  commitPending(target: EventTarget | null): void {
    const field = this.radius.getElement();
    if (target === field || field.ownerDocument.activeElement !== field) return;
    if (this.radius.isTyping()) this.commitRadius();
    field.blur();
  }

  /** Commits the fraction to the selection remembered on focus. */
  private commitRadius(): void {
    const value = this.radius.parseNumberOrNull();
    if (value !== null) this.session.setCornerRadius(Math.min(1, Math.max(0, value)), this.targets);
    this.refresh();
  }
}
