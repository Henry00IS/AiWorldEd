import {
  CURVE_CROSS_ARM_DEFAULT,
  CURVE_CROSS_ARM_MAX,
  CURVE_CROSS_ARM_MIN,
  CURVE_STADIUM_STRAIGHT_DEFAULT,
  CURVE_STADIUM_STRAIGHT_MAX,
  CURVE_STADIUM_STRAIGHT_MIN,
  CURVE_CORNER_SIDES_DEFAULT,
  CURVE_CORNER_SIDES_MAX,
  CURVE_POLYGON_SIDES,
  CURVE_ROTATION_MAX,
  CURVE_SECTION_CHOICES,
} from '@/curve/model/curve_section.js';
import type { CurveSegmentSection } from '@/curve/model/curve_model.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { curveEditorGroup, curveEditorLabel } from './curve_editor_label.js';
import { CurveEditorSectionField, type CurveEditorSectionFieldOptions } from './curve_editor_section_field.js';
import { CurveEditorSideControls } from './curve_editor_side_controls.js';
import { CurveEditorBlendControl } from './curve_editor_blend_control.js';
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
    label: 'Corner Sides',
    sections: ['square', 'polygon'],
    cornered: true,
    fallback: CURVE_CORNER_SIDES_DEFAULT,
    min: 1,
    max: CURVE_CORNER_SIDES_MAX,
    step: 1,
    decimals: 0,
  },
  {
    property: 'armWidth',
    label: 'Arm Width',
    sections: ['cross'],
    fallback: CURVE_CROSS_ARM_DEFAULT,
    min: CURVE_CROSS_ARM_MIN,
    max: CURVE_CROSS_ARM_MAX,
    step: 0.05,
    hint: 'Thickness of each arm of the cross as a fraction of the section width. Both arms keep the same thickness when Depth / width stretches the cross.',
  },
  {
    property: 'armWidth',
    label: 'Thickness',
    sections: ['bar'],
    fallback: CURVE_CROSS_ARM_DEFAULT,
    min: CURVE_CROSS_ARM_MIN,
    max: CURVE_CROSS_ARM_MAX,
    step: 0.05,
    hint: 'Thickness of the bar at the bottom of the segment, as a fraction of the section width. It keeps this thickness when Depth / width stretches the bar.',
  },
  {
    property: 'armWidthEnd',
    label: 'End',
    sections: ['bar'],
    fallback: CURVE_CROSS_ARM_DEFAULT,
    fallbackFrom: 'armWidth',
    min: 0,
    max: CURVE_CROSS_ARM_MAX,
    step: 0.05,
    hint: 'Thickness of the bar at the top of the segment. The bar tapers smoothly between Thickness and End, like a wedge; 0 makes a sharp edge, as on a chisel or blade.',
  },
  {
    property: 'straight',
    label: 'Straight',
    sections: ['stadium'],
    fallback: CURVE_STADIUM_STRAIGHT_DEFAULT,
    min: CURVE_STADIUM_STRAIGHT_MIN,
    max: CURVE_STADIUM_STRAIGHT_MAX,
    step: 0.05,
    hint: 'Length of the flat sides as a fraction of the section width; the rest is the two round ends, which use the column Sides setting.',
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
 * Section picker, blend, side mode and fixed depth, section-specific
 * parameters, rotation and accumulated twist controls. They hide while the
 * secondary line is edited, since sections belong to the main profile.
 */
export class CurveEditorSectionControls {
  private readonly select = new InputSelect(CURVE_SECTION_CHOICES, 'Section');
  private readonly sectionLabel = curveEditorLabel('Section');
  private readonly sidesLabel = curveEditorLabel('Sides');
  private readonly sectionGroup = curveEditorGroup();
  private readonly sidesGroup = curveEditorGroup();
  private readonly sides = new InputSelect(
    CURVE_POLYGON_SIDES.map((value) => ({ value: String(value), label: String(value) })),
    'Polygon sides',
  );
  private readonly numeric: CurveEditorSectionField[];
  private readonly sideControls: CurveEditorSideControls;
  private readonly blendControl: CurveEditorBlendControl;

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
    this.sideControls = new CurveEditorSideControls(session);
    this.blendControl = new CurveEditorBlendControl(session);
    this.sectionGroup.append(this.sectionLabel, this.select.getElement());
    this.sidesGroup.append(this.sidesLabel, this.sides.getElement());
  }

  /**
   * Returns toolbar controls in reading order.
   *
   * @returns Captions and controls.
   */
  elements(): HTMLElement[] {
    return [
      this.sectionGroup,
      this.blendControl.element(),
      this.sidesGroup,
      ...this.sideControls.elements(),
      ...this.numeric.flatMap((field) => field.elements()),
    ];
  }

  /**
   * Reflects shared values, showing section-specific fields only when
   * applicable.
   */
  refresh(): void {
    const primary = this.session.layer === 'primary';
    const targets = primary ? this.session.sectionTargets() : [];
    const segments = targets.map((index) => this.session.curve.segments[index]);
    this.sectionGroup.style.display = primary ? 'inline-flex' : 'none';
    this.select.getElement().style.display = primary ? '' : 'none';
    this.sideControls.refresh(segments);
    this.blendControl.refresh(targets);
    this.select.setSharedValues(segments.map((segment) => segment?.section ?? 'round'));
    this.select.getElement().disabled = segments.length === 0;
    const polygons = segments.filter((segment) => segment?.section === 'polygon');
    this.sidesGroup.style.display = polygons.length > 0 ? 'inline-flex' : 'none';
    this.sides.getElement().style.display = polygons.length > 0 ? '' : 'none';
    this.sides.setSharedValues(polygons.map((segment) => String(segment?.polygonSides ?? 6)));
    for (const field of this.numeric) field.refresh(segments);
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
