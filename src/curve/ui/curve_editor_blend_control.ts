import { curveSegmentBlendable } from '@/curve/model/curve_blend.js';
import type { CurveEditorSession } from './curve_editor_session.js';

/** Tooltip of the Blend checkbox. */
const CURVE_EDITOR_BLEND_HINT =
  'Morph smoothly from a neighbouring segment whose section differs, as one convex shape across this whole segment, instead of stepping at the shared point. Add a point to make the transition shorter. Where both segments at a point blend, they meet halfway.';

/**
 * Blend checkbox of the selected segments, shown when one of them meets a
 * different cross-section at one of its points.
 */
export class CurveEditorBlendControl {
  private readonly label = document.createElement('label');
  private readonly checkbox = document.createElement('input');

  /**
   * Binds the checkbox to the selected segments.
   *
   * @param session Editing session.
   */
  constructor(private readonly session: CurveEditorSession) {
    this.checkbox.type = 'checkbox';
    this.checkbox.setAttribute('aria-label', 'Blend');
    this.checkbox.addEventListener('change', () => this.session.setBlend(this.checkbox.checked));
    this.label.title = CURVE_EDITOR_BLEND_HINT;
    Object.assign(this.label.style, { display: 'inline-flex', alignItems: 'center', fontSize: '11px' });
    Object.assign(this.label.style, { marginLeft: '6px', whiteSpace: 'nowrap', cursor: 'pointer' });
    this.label.append(this.checkbox, 'Blend');
  }

  /**
   * Returns the toolbar element.
   *
   * @returns Label holding the checkbox.
   */
  element(): HTMLElement {
    return this.label;
  }

  /**
   * Shows the checkbox when a targeted segment can blend, with the shared value
   * or a mixed state.
   *
   * @param targets Targeted segment indices on the main line; empty hides it.
   */
  refresh(targets: readonly number[]): void {
    const curve = this.session.curve;
    const blendable = targets.filter((index) => curveSegmentBlendable(curve, index));
    this.label.style.display = blendable.length > 0 ? 'inline-flex' : 'none';
    const on = blendable.map((index) => curve.segments[index]?.blend === true);
    this.checkbox.checked = on.length > 0 && on.every(Boolean);
    this.checkbox.indeterminate = on.some(Boolean) && !on.every(Boolean);
  }
}
