import type { CurveMarkerSide } from '@/curve/model/curve_markers.js';
import { CURVE_DETAIL_MAX, CURVE_DETAIL_MIN, type CurveSegmentMode } from '@/curve/model/curve_model.js';
import type { CurvePreset } from '@/curve/model/curve_preset.js';
import { CurveEditorPresetMenu } from './curve_editor_presets.js';
import type { InputNumeric } from '@/ui/input/input_numeric.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import { styleFloatingPanelChromeButton } from '@/ui/floating_panel/panel_floating_title_bar.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import type { CurveEditorSession } from './curve_editor_session.js';
import { CURVE_UI_ACTIVE_BACKGROUND, CURVE_UI_COLORS } from './curve_ui_style.js';

/** Caption and tooltip of the section marker toggles. */
const CURVE_EDITOR_MARKER_BUTTONS: Readonly<Record<CurveMarkerSide, readonly [string, string]>> = {
  bottom: ['Base', 'Bottom marker: the profile below it keeps a fixed height (right-click a marker to remove it)'],
  top: ['Top', 'Top marker: the profile above it keeps a fixed height (right-click a marker to remove it)'],
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
}

/** Segment modes with their button captions. */
const CURVE_EDITOR_MODE_BUTTONS: readonly [CurveSegmentMode, string, string][] = [
  ['linear', 'Linear', 'Straight segment (1)'],
  ['quadratic', 'Quadratic', 'Bent by one control (2)'],
  ['bezier', 'Bezier', 'Bent by two handles (3)'],
];

/**
 * Creates a small toolbar button.
 *
 * @param label Caption.
 * @param title Tooltip.
 * @param onClick Click action.
 * @returns Button.
 */
export function curveEditorButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  styleFloatingPanelChromeButton(button);
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Paints a toggle button active or inactive in the dark theme; an inactive
 * button keeps the normal button background.
 *
 * @param button Toggle button.
 * @param active True for the active choice.
 */
export function curveEditorButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.style.background = active ? CURVE_UI_ACTIVE_BACKGROUND : hexToRgb(Theme.buttonBackground);
  button.style.borderColor = active ? CURVE_UI_COLORS.line : Theme.inputBorderColor;
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

/**
 * Enables or disables a toolbar button, dimming it without the browser's pale
 * default disabled look.
 *
 * @param button Button.
 * @param disabled True to disable.
 */
export function curveEditorButtonEnable(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
  button.style.opacity = disabled ? '0.45' : '1';
  button.style.cursor = disabled ? 'default' : 'pointer';
}

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
 * Creates a caption for a control.
 *
 * @param text Caption text.
 * @returns Label element.
 */
export function curveEditorLabel(text: string): HTMLElement {
  const label = document.createElement('span');
  label.textContent = text;
  Object.assign(label.style, { color: CURVE_UI_COLORS.text, fontSize: '11px', marginLeft: '6px' });
  return label;
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
  private readonly squareButton: HTMLButtonElement;
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
    this.undoButton = curveEditorButton('Undo', 'Undo (Ctrl+Z)', () => session.undo());
    this.redoButton = curveEditorButton('Redo', 'Redo (Ctrl+Y or Ctrl+Shift+Z)', () => session.redo());
    this.deleteButton = curveEditorButton('Delete', 'Delete the selected points (Del)', () => session.deleteSelected());
    this.squareButton = curveEditorButton(
      'Square',
      'Square cross-section for the selected segments, like a turnery block; round segments use the Sides setting (S)',
      () => session.toggleSquare(),
    );
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
    const history = this.session.historyState();
    curveEditorButtonEnable(this.undoButton, !history.undo);
    curveEditorButtonEnable(this.redoButton, !history.redo);
    this.snapToggle.checked = this.session.snapOn;
    this.presetMenu.refresh(this.session.curve);
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
    curveEditorButtonEnable(this.squareButton, this.session.sectionTargets().length === 0);
    curveEditorButtonActive(this.squareButton, this.session.sectionSquare());
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

  /**
   * Builds the segment, edit and history row.
   *
   * @returns Row.
   */
  private createEditRow(): HTMLElement {
    for (const [mode, label, title] of CURVE_EDITOR_MODE_BUTTONS)
      this.modeButtons.set(
        mode,
        curveEditorButton(label, title, () => this.session.setMode(mode)),
      );
    this.segmentTools.push(
      curveEditorButton('Straighten', 'Make the segment a straight line', () => this.session.straighten()),
      curveEditorButton('Flatten', 'Level the segment at its average height', () => this.session.flatten()),
    );
    const mirror = curveEditorButton('Mirror', 'Mirror the curve left to right', () => this.session.mirror());
    const flip = curveEditorButton('Flip', 'Flip the curve upside down', () => this.session.flip());
    return curveEditorRow(
      ...this.modeButtons.values(),
      curveEditorLabel('Detail'),
      this.detail.getElement(),
      this.squareButton,
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
      curveEditorButton('Save', 'Save the curve as a .curve file', () => this.actions.save(this.name.value)),
      curveEditorButton('Load', 'Load a .curve file', this.actions.load),
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
