import {
  CURVE_CORNER_SIDES_DEFAULT,
  CURVE_CORNER_SIDES_MAX,
  CURVE_POLYGON_SIDES,
  CURVE_ROTATION_MAX,
  CURVE_SECTION_CHOICES,
} from '@/curve/model/curve_section.js';
import type { CurveSegmentSection } from '@/curve/model/curve_model.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { curveEditorLabel } from './curve_editor_label.js';
import { CurveEditorSectionField, type CurveEditorSectionFieldOptions } from './curve_editor_section_field.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** Numeric metadata for the standard section toolbar fields. */
const CURVE_EDITOR_SECTION_FIELDS: readonly CurveEditorSectionFieldOptions[] = [
  {
    property: 'cornerSize',
    label: 'Corner',
    sections: ['square', 'polygon'],
    fallback: 0,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    property: 'cornerSides',
    label: 'Corner sides',
    sections: ['square', 'polygon'],
    cornered: true,
    fallback: CURVE_CORNER_SIDES_DEFAULT,
    min: 1,
    max: CURVE_CORNER_SIDES_MAX,
    step: 1,
    decimals: 0,
  },
  {
    property: 'rotation',
    label: 'Rotation °',
    fallback: 0,
    min: -CURVE_ROTATION_MAX,
    max: CURVE_ROTATION_MAX,
    step: 15,
    hint: "Turns the whole segment about the column axis, like a block on a pole. It is added to the twist accumulated below and does not carry over to the next segment; this segment's own Twist turns on top of it.",
  },
  {
    property: 'twist',
    label: 'Twist °',
    fallback: 0,
    min: -1440,
    max: 1440,
    step: 15,
    hint: 'Turns the section gradually over this segment. Twist accumulates: every later segment starts where this one ends.',
  },
];

/**
 * Section picker, section-specific parameters, rotation and accumulated twist
 * controls.
 */
export class CurveEditorSectionControls {
  private readonly select = new InputSelect(CURVE_SECTION_CHOICES, 'Section');
  private readonly sectionLabel = curveEditorLabel('Section');
  private readonly sidesLabel = curveEditorLabel('Sides');
  private readonly sides = new InputSelect(
    CURVE_POLYGON_SIDES.map((value) => ({ value: String(value), label: String(value) })),
    'Polygon sides',
  );
  private readonly numeric: CurveEditorSectionField[];

  /**
   * Binds standard controls to every selected curve segment.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    Object.assign(this.select.getElement().style, { width: '136px', flex: '0 0 136px' });
    this.select.bindCommit(() => this.session.setSection(this.select.getValue() as CurveSegmentSection));
    Object.assign(this.sides.getElement().style, { width: '52px', flex: '0 0 52px' });
    this.sides.bindCommit(() => this.session.setSectionProperty('polygonSides', Number(this.sides.getValue())));
    this.numeric = CURVE_EDITOR_SECTION_FIELDS.map((options) => new CurveEditorSectionField(session, options));
  }

  /**
   * Returns toolbar controls in reading order.
   *
   * @returns Captions and controls.
   */
  elements(): HTMLElement[] {
    return [
      this.sectionLabel,
      this.select.getElement(),
      this.sidesLabel,
      this.sides.getElement(),
      ...this.numeric.flatMap((field) => field.elements()),
    ];
  }

  /**
   * Reflects shared values, showing section-specific fields only when
   * applicable.
   */
  refresh(): void {
    const segments = this.session.sectionTargets().map((index) => this.session.curve.segments[index]);
    this.select.setSharedValues(segments.map((segment) => segment?.section ?? 'round'));
    this.select.getElement().disabled = segments.length === 0;
    const polygons = segments.filter((segment) => segment?.section === 'polygon');
    const display = polygons.length > 0 ? '' : 'none';
    this.sidesLabel.style.display = display;
    this.sides.getElement().style.display = display;
    this.sides.setSharedValues(polygons.map((segment) => String(segment?.polygonSides ?? 6)));
    for (const field of this.numeric) field.refresh();
  }

  /**
   * Commits pending numeric edits before graph selection changes.
   *
   * @param target Pressed element.
   */
  commitPending(target: EventTarget | null): void {
    for (const field of this.numeric) field.commitPending(target);
  }
}
