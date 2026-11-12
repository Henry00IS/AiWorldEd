import {
  CURVE_FIXED_DEPTH_SECTIONS,
  CURVE_SIDE_CHOICES,
  CURVE_SIDE_SECTIONS,
  type CurveSideChoice,
} from '@/curve/model/curve_section.js';
import type { CurveSegment } from '@/curve/model/curve_model.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { curveEditorGroup, curveEditorLabel } from './curve_editor_label.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** Tooltip of the side picker. */
const CURVE_EDITOR_SIDE_HINT =
  'Which side follows the profile. Mirror grows both sides; −X only and +X only keep the other side straight at the narrowest width of the run; Custom shapes the −X side with its own line (switch lines with Tab).';

/** Tooltip of the fixed depth checkbox. */
const CURVE_EDITOR_FIXED_DEPTH_HINT =
  'Keep the depth of the lowest ring of the run while the width follows the profile, so the front and back stay flat, like a brick pier.';

/**
 * Side mode picker and fixed depth checkbox of Bar, Square and Stadium
 * segments.
 */
export class CurveEditorSideControls {
  private readonly sideLabel = curveEditorLabel('Side');
  private readonly side = new InputSelect(CURVE_SIDE_CHOICES, 'Side');
  private readonly sideGroup = curveEditorGroup();
  private readonly depthLabel = document.createElement('label');
  private readonly depth = document.createElement('input');

  /**
   * Binds the controls to the selected segments.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    this.sideLabel.title = this.side.getElement().title = CURVE_EDITOR_SIDE_HINT;
    Object.assign(this.side.getElement().style, { width: '92px', flex: '0 0 92px' });
    this.side.bindCommit(() => this.session.setSide(this.side.getValue() as CurveSideChoice));
    this.depth.type = 'checkbox';
    this.depth.setAttribute('aria-label', 'Fixed depth');
    this.depth.addEventListener('change', () => this.session.setFixedDepth(this.depth.checked));
    this.depthLabel.title = CURVE_EDITOR_FIXED_DEPTH_HINT;
    Object.assign(this.depthLabel.style, { display: 'inline-flex', alignItems: 'center', fontSize: '11px' });
    Object.assign(this.depthLabel.style, { marginLeft: '6px', whiteSpace: 'nowrap', cursor: 'pointer' });
    this.depthLabel.append(this.depth, 'Fixed depth');
    this.sideGroup.append(this.sideLabel, this.side.getElement());
  }

  /**
   * Returns the captions and controls in reading order.
   *
   * @returns Toolbar elements.
   */
  elements(): HTMLElement[] {
    return [this.sideGroup, this.depthLabel];
  }

  /**
   * Shows each control only when every selected segment's section supports it,
   * with the shared value or a mixed state.
   *
   * @param segments Selected segments.
   */
  refresh(segments: readonly (CurveSegment | undefined)[]): void {
    const sections = segments.map((segment) => segment?.section ?? 'round');
    const sided = sections.length > 0 && sections.every((section) => CURVE_SIDE_SECTIONS.includes(section));
    const deep = sections.length > 0 && sections.every((section) => CURVE_FIXED_DEPTH_SECTIONS.includes(section));
    this.sideGroup.style.display = sided ? 'inline-flex' : 'none';
    this.side.getElement().style.display = sided ? '' : 'none';
    this.depthLabel.style.display = deep ? 'inline-flex' : 'none';
    this.side.setSharedValues(segments.map((segment) => segment?.side ?? 'mirror'));
    const fixed = segments.map((segment) => !!segment?.fixedDepth);
    this.depth.checked = fixed.length > 0 && fixed.every(Boolean);
    this.depth.indeterminate = fixed.some(Boolean) && !fixed.every(Boolean);
  }
}
