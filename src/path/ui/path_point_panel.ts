import {
  PATH_ASSET_SEGMENT_KINDS,
  type PathAsset,
  type PathAssetPoint,
  type PathAssetSegment,
  type PathAssetSegmentKind,
} from '@/path/model/path_asset.js';
import {
  pathAssetPointMove,
  pathAssetPointRemove,
  pathAssetSegmentKindSet,
  pathAssetSegmentSet,
} from '@/path/model/path_asset_edit.js';
import { InputSelect } from '@/ui/input/input_select.js';
import { inputNumericCreateUvField } from '@/ui/input/input_numeric_uv_field.js';
import {
  modifierStackUiCaption,
  modifierStackUiRow,
  modifierStackUiTextButton,
} from '@/modifier/stack/ui/modifier_stack_ui_style.js';

/** What each setting of a stretch is called in the inspector. */
const PATH_POINT_PANEL_HANDLES = { control: 'Control', out: 'Out', in: 'In', axis: 'Arc Axis' } as const;

/**
 * The selected point of a path in the inspector: its position, the kind and
 * settings of the stretch leaving it, and Delete Point. Nothing shows while no
 * point is selected; points are picked in the scene.
 */
export class PathPointPanel {
  /** Panel element. */
  private readonly element = document.createElement('div');

  /**
   * Builds the panel.
   *
   * @param onCommit Receives the changed path.
   */
  constructor(private readonly onCommit: (path: PathAsset) => void) {
    this.element.dataset['pathPoint'] = 'true';
    Object.assign(this.element.style, { display: 'none', gap: '2px' });
  }

  /**
   * Returns the panel element.
   *
   * @returns Element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Shows a point of a path, or hides the panel.
   *
   * @param path Path.
   * @param index Selected point, or null.
   */
  show(path: PathAsset, index: number | null): void {
    const point = index === null ? undefined : path.points[index];
    this.element.style.display = point ? 'grid' : 'none';
    if (!point || index === null) return void this.element.replaceChildren();
    const removed = pathAssetPointRemove(path, index);
    this.element.replaceChildren(
      modifierStackUiCaption(`Point ${index + 1} of ${path.points.length}`),
      this.vectorRow('Point', point, (moved) => this.onCommit(pathAssetPointMove(path, index, moved))),
      ...this.stretchRows(path, index),
      ...(removed
        ? [modifierStackUiTextButton('Delete Point', 'Remove this point', () => this.onCommit(removed))]
        : []),
    );
  }

  /**
   * Builds the rows of the stretch leaving a point: its kind, then Degrees and
   * Axis for an Arc, Control for Quadratic, Out and In for Bezier.
   *
   * @param path Path.
   * @param index Point index, which is the stretch index.
   * @returns Rows; none for the last point of an open path.
   */
  private stretchRows(path: PathAsset, index: number): HTMLElement[] {
    const segment = path.segments[index];
    if (!segment) return [];
    const kind = new InputSelect(
      PATH_ASSET_SEGMENT_KINDS.map((each) => ({ value: each, label: each })),
      'Stretch',
    );
    kind.setSharedValues([segment.kind]);
    kind.bindCommit(() => this.onCommit(pathAssetSegmentKindSet(path, index, kind.getValue() as PathAssetSegmentKind)));
    const set = (changed: Partial<PathAssetSegment>): void =>
      this.onCommit(pathAssetSegmentSet(path, index, { ...segment, ...changed }));
    const handles = (['control', 'out', 'in', 'axis'] as const).flatMap((key) => {
      const value = segment[key];
      return value ? [this.vectorRow(PATH_POINT_PANEL_HANDLES[key], value, (moved) => set({ [key]: moved }))] : [];
    });
    const rows = [modifierStackUiRow('Stretch', kind.getElement(), 'How the path runs on to the next point')];
    if (segment.degrees !== undefined) rows.push(this.degreesRow(segment.degrees, (degrees) => set({ degrees })));
    return [...rows, ...handles];
  }

  /**
   * Builds the Arc Degrees row: a sweep from 1 to 359 degrees either way.
   *
   * @param degrees Sweep shown.
   * @param onChange Receives a typed sweep.
   * @returns Row.
   */
  private degreesRow(degrees: number, onChange: (degrees: number) => void): HTMLElement {
    const field = inputNumericCreateUvField(15, 'Arc Degrees');
    field.setNumber(degrees, 0);
    field.bindCommit(() => {
      const typed = field.parseNumberOrNull();
      if (typed === null || !Number.isFinite(typed) || typed === 0) return;
      onChange(Math.sign(typed) * Math.min(359, Math.max(1, Math.abs(typed))));
    });
    return modifierStackUiRow('Arc Degrees', field.getElement(), 'How far the arc turns; negative bends the other way');
  }

  /**
   * Builds a row of X, Y and Z number fields.
   *
   * @param label Row label, also the start of each field's name.
   * @param value Shown point.
   * @param onChange Receives the point with one number typed.
   * @returns Row.
   */
  private vectorRow(label: string, value: PathAssetPoint, onChange: (point: PathAssetPoint) => void): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px' });
    ['X', 'Y', 'Z'].forEach((axis, index) => {
      const field = inputNumericCreateUvField(0.25, `${label} ${axis}`);
      field.setNumber(value[index]!, 2);
      field.bindCommit(() => {
        const typed = field.parseNumberOrNull();
        if (typed === null || !Number.isFinite(typed)) return;
        onChange(value.map((each, at) => (at === index ? typed : each)) as unknown as PathAssetPoint);
      });
      row.append(field.getElement());
    });
    return modifierStackUiRow(label, row);
  }
}
