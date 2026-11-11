import { curveEditorLabel } from './curve_editor_label.js';
import { CurveEditorSectionControls } from './curve_editor_section_controls.js';
import type { CurveMarkerSide } from '@/curve/model/curve_markers.js';
import { CURVE_DETAIL_MAX, CURVE_DETAIL_MIN, type CurveSegmentMode } from '@/curve/model/curve_model.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { CurveEditorPresetMenu } from './curve_editor_presets.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { Theme } from '@/theme.js';
import { curveEditorButton, curveEditorButtonActive, curveEditorButtonEnable } from './curve_editor_toolbar_buttons.js';
import { CurveEditorLayerToggle } from './curve_editor_layer_toggle.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import { CURVE_UI_COLORS } from './curve_ui_style.js';

/** Caption and tooltip of the section marker toggles. */
const CURVE_EDITOR_MARKER_BUTTONS: Readonly<Record<CurveMarkerSide, readonly [string, string]>> = {
  bottom: [
    'Base',
    'Bottom marker: the profile below it keeps a fixed height (right-click a marker to switch it off; it remembers its place)',
  ],
  top: [
    'Top',
    'Top marker: the profile above it keeps a fixed height (right-click a marker to switch it off; it remembers its place)',
  ],
};

/** Editor-level actions the toolbar triggers. */
export interface CurveEditorToolbarActions {
  /** Fits the curve into view. */
  frameAll: () => void;
  /** Turns the view by 90 degrees. */
  rotate: () => void;
  /** Saves the curve under a name. */
  save: (name: string) => void;
  /** Loads a curve file. */
  load: () => void;
  /** Redraws the canvas. */
  redraw: () => void;
  /** Steps back in the edited value's history. */
  undo: () => void;
  /** Steps forward in the edited value's history. */
  redo: () => void;
  /** Returns whether undo and redo are possible. */
  historyState: () => { undo: boolean; redo: boolean };
}

/** Segment modes with their button captions. */
const CURVE_EDITOR_MODE_BUTTONS: readonly [CurveSegmentMode, string, string][] = [
  ['linear', 'Linear', 'Straight segment (1)'],
  ['quadratic', 'Quadratic', 'Bent by one control (2)'],
  ['bezier', 'Bezier', 'Bent by two handles (3)'],
];

/**
 * Gives every toolbar control the editor's standard control height, padding and
 * font so both rows line up on one baseline.
 *
 * @param toolbar Toolbar element.
 */
function curveEditorToolbarSizes(toolbar: HTMLElement): void {
  const height = `${Theme.viewportToolOptionsControlHeightPx}px`;
  const controls = toolbar.querySelectorAll<HTMLElement>('button, input:not([type=checkbox]), select');
  for (const control of controls) {
    Object.assign(control.style, { boxSizing: 'border-box', height, minHeight: height, maxHeight: height });
    Object.assign(control.style, { margin: '0', fontSize: '11px', lineHeight: '1', verticalAlign: 'middle' });
    if (control instanceof HTMLButtonElement) {
      Object.assign(control.style, { display: 'inline-flex', alignItems: 'center', padding: '0 6px' });
    } else Object.assign(control.style, { padding: '0 6px' });
  }
  for (const box of toolbar.querySelectorAll<HTMLElement>('input[type=checkbox]'))
    Object.assign(box.style, { margin: '0 4px 0 0', width: '14px', height: '14px', verticalAlign: 'middle' });
}

/**
 * Creates a toolbar row.
 *
 * @param children Row content.
 * @returns Row element.
 */
function curveEditorRow(...children: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', flexWrap: 'wrap' });
  row.style.minHeight = `${Theme.viewportToolOptionsControlHeightPx + 8}px`;
  row.append(...children);
  return row;
}

/**
 * Buttons and fields above the curve canvas: segment mode and detail, edit
 * tools, history, snapping, view, presets and files.
 */
export class CurveEditorToolbar {
  private readonly element: HTMLElement;
  private readonly modeButtons = new Map<CurveSegmentMode, HTMLButtonElement>();
  private readonly detail: InputNumeric;
  private readonly snapToggle: HTMLInputElement;
  private readonly snapStep: InputNumeric;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly segmentTools: HTMLButtonElement[] = [];
  private readonly deleteButton: HTMLButtonElement;
  private readonly presetMenu: CurveEditorPresetMenu;
  private readonly sectionControls: CurveEditorSectionControls;
  private readonly layerToggle: CurveEditorLayerToggle;
  private readonly markerButtons = new Map<CurveMarkerSide, HTMLButtonElement>();
  private readonly name: HTMLInputElement;
  /** Segment the detail field edits: the one selected when typing began. */
  private detailTarget = -1;
  /** Detail text when the field gained focus, restored by Escape. */
  private detailBefore = '';
  /** True once this focus's typed detail has been applied. */
  private detailDone = false;

  /**
   * Builds the toolbar.
   *
   * @param session Editing session.
   * @param presets Presets offered in the menu.
   * @param actions Editor actions.
   * @param fileName Default file name.
   */
  constructor(
    private readonly session: CurveEditorSession,
    presets: readonly CurvePreset[],
    private readonly actions: CurveEditorToolbarActions,
    fileName: string,
  ) {
    this.detail = inputNumericCreateUvField(1, 'Bezier detail');
    this.detail.bindCommit(() => this.detailCommit());
    this.bindDetailTarget();
    this.snapToggle = this.createSnapToggle();
    this.snapStep = inputNumericCreateUvField(0.01, 'Snap step');
    this.snapStep.bindCommit(() => this.snapStepCommit());
    this.undoButton = curveEditorButton('Undo', 'Undo (Ctrl+Z)', () => actions.undo());
    this.redoButton = curveEditorButton('Redo', 'Redo (Ctrl+Y or Ctrl+Shift+Z)', () => actions.redo());
    this.deleteButton = curveEditorButton('Delete', 'Delete the selected points (Del)', () => session.deleteSelected());
    this.sectionControls = new CurveEditorSectionControls(session);
    this.layerToggle = new CurveEditorLayerToggle(session);
    this.presetMenu = new CurveEditorPresetMenu(presets, (curve) => session.replace(curve));
    this.name = this.createNameInput(fileName);
    this.element = document.createElement('div');
    this.element.append(this.createEditRow(), this.createViewRow());
    curveEditorToolbarSizes(this.element);
    this.refresh();
  }

  /**
   * Returns the toolbar element.
   *
   * @returns Element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /** Updates enabled and active states from the session. */
  refresh(): void {
    this.refreshSegment();
    const last = this.session.curve.points.length - 1;
    curveEditorButtonEnable(this.deleteButton, !this.session.points.some((index) => index > 0 && index < last));
    const history = this.actions.historyState();
    curveEditorButtonEnable(this.undoButton, !history.undo);
    curveEditorButtonEnable(this.redoButton, !history.redo);
    this.snapToggle.checked = this.session.snapOn;
    this.presetMenu.refresh(this.session.fullCurve);
    this.layerToggle.refresh();
    for (const [side, button] of this.markerButtons)
      curveEditorButtonActive(button, this.session.curve.markers?.[side] !== undefined);
    if (!this.snapStep.isTyping()) this.snapStep.setNumber(this.session.snapStep, 2);
  }

  /** Shows the active segment's type and detail, or disables them without one. */
  private refreshSegment(): void {
    const current = this.session.curve.segments[this.session.activeSegment()];
    for (const [mode, button] of this.modeButtons) {
      curveEditorButtonEnable(button, !current);
      curveEditorButtonActive(button, current?.mode === mode);
    }
    for (const button of this.segmentTools) curveEditorButtonEnable(button, !current);
    this.sectionControls.refresh();
    this.detail.getElement().disabled = !current || current.mode === 'linear';
    this.detail.setNumber(current && current.mode !== 'linear' ? current.detail : null, 0);
  }

  /**
   * Commits a detail value still being typed, before a press elsewhere (such as
   * on the graph) changes the selection.
   *
   * @param target Element being pressed.
   */
  commitPending(target: EventTarget | null): void {
    this.sectionControls.commitPending(target);
    const field = this.detail.getElement();
    if (target === field || field.ownerDocument.activeElement !== field) return;
    if (this.detail.isTyping()) this.detailCommit();
    field.blur();
    this.refreshSegment();
  }

  /** Remembers the edited segment on focus; Escape restores the old value. */
  private bindDetailTarget(): void {
    const field = this.detail.getElement();
    field.addEventListener('focus', () => {
      this.detailTarget = this.session.activeSegment();
      this.detailBefore = field.value;
      this.detailDone = false;
    });
    field.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      field.value = this.detailBefore;
      this.detailDone = true;
      field.blur();
    });
  }

  /** Creates the bend mode buttons and the segment tools. */
  private createSegmentButtons(): void {
    for (const [mode, label, title] of CURVE_EDITOR_MODE_BUTTONS)
      this.modeButtons.set(
        mode,
        curveEditorButton(label, title, () => this.session.setMode(mode)),
      );
    this.segmentTools.push(
      curveEditorButton('Straighten', 'Make the segment a straight line', () => this.session.straighten()),
      curveEditorButton('Flatten', 'Level the segment at its average height', () => this.session.flatten()),
    );
  }

  /**
   * Builds the segment, edit and history row.
   *
   * @returns Row.
   */
  private createEditRow(): HTMLElement {
    this.createSegmentButtons();
    const mirror = curveEditorButton('Mirror', 'Mirror the curve left to right', () => this.session.mirror());
    const flip = curveEditorButton('Flip', 'Flip the curve upside down', () => this.session.flip());
    return curveEditorRow(
      ...this.layerToggle.elements(),
      ...this.modeButtons.values(),
      curveEditorLabel('Detail'),
      this.detail.getElement(),
      ...this.sectionControls.elements(),
      ...this.segmentTools,
      this.deleteButton,
      mirror,
      flip,
      this.undoButton,
      this.redoButton,
    );
  }

  /**
   * Builds the snapping, view, preset and file row.
   *
   * @returns Row.
   */
  private createViewRow(): HTMLElement {
    const snapLabel = curveEditorLabel('Snap');
    snapLabel.style.marginLeft = '0';
    return curveEditorRow(
      snapLabel,
      this.snapToggle,
      this.snapStep.getElement(),
      curveEditorButton('Frame', 'Fit the whole curve into view (F)', this.actions.frameAll),
      curveEditorButton('Rotate', 'Turn the view 90 degrees: 0 at the bottom, 1 at the top (R)', this.actions.rotate),
      ...(['bottom', 'top'] as const).map((side) => this.createMarkerButton(side)),
      this.presetMenu.getElement(),
      this.name,
      curveEditorButton('Save', 'Save the curve as a .aicurve file', () => this.actions.save(this.name.value)),
      curveEditorButton('Load', 'Load a .aicurve file', this.actions.load),
    );
  }

  /**
   * Creates a toggle that adds or removes a section marker.
   *
   * @param side Marker.
   * @returns Button.
   */
  private createMarkerButton(side: CurveMarkerSide): HTMLButtonElement {
    const [label, title] = CURVE_EDITOR_MARKER_BUTTONS[side];
    const button = curveEditorButton(label, title, () =>
      this.session.setMarker(side, this.session.curve.markers?.[side] === undefined),
    );
    button.dataset['curveMarker'] = side;
    this.markerButtons.set(side, button);
    return button;
  }

  /**
   * Creates the snap checkbox.
   *
   * @returns Checkbox.
   */
  private createSnapToggle(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.title = 'Snap points and handles to the grid';
    input.setAttribute('aria-label', 'Snap to grid');
    input.addEventListener('change', () => {
      this.session.snapOn = input.checked;
      this.actions.redraw();
    });
    return input;
  }

  /**
   * Sets the file name next to Save.
   *
   * @param name Name.
   */
  fileNameSet(name: string): void {
    this.name.value = name;
  }

  /**
   * Creates the file name field next to Save.
   *
   * @param fileName Default name.
   * @returns Text input.
   */
  private createNameInput(fileName: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = fileName;
    input.title = 'File name for Save';
    input.setAttribute('aria-label', 'Curve file name');
    const background = '#2a2a2a';
    Object.assign(input.style, { width: '90px', background, color: CURVE_UI_COLORS.text });
    Object.assign(input.style, { border: '1px solid #4a4a4a', borderRadius: '3px', padding: '0 4px' });
    return input;
  }

  /** Applies a typed detail. */
  private detailCommit(): void {
    const value = this.detail.parseNumberOrNull();
    if (value === null || this.detailDone) return;
    this.detailDone = true;
    const detail = Math.round(Math.min(CURVE_DETAIL_MAX, Math.max(CURVE_DETAIL_MIN, value)));
    this.session.setDetailAt(this.detailTarget, detail);
  }

  /** Applies a typed snap step. */
  private snapStepCommit(): void {
    const value = this.snapStep.parseNumberOrNull();
    if (value !== null && value > 0 && value <= 1) this.session.snapStep = value;
    this.refresh();
    this.actions.redraw();
  }
}
