import {
  PATH_ASSET_SEGMENT_KINDS,
  type PathAsset,
  type PathAssetPoint,
  type PathAssetSegment,
  type PathAssetSegmentKind,
} from '@/path/model/path_asset.js';
import {
  pathAssetPointMove,
  pathAssetPointsRemove,
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

/** Axis letters of the X, Y and Z rows. */
const PATH_POINT_PANEL_AXES = ['X', 'Y', 'Z'] as const;

/** Points and stretches the panel shows. */
export interface PathPointPanelSelection {
  /** Selected point indices. */
  points: readonly number[];
  /** Selected stretch indices. */
  segments: readonly number[];
}

/** Nothing selected. */
export const PATH_POINT_PANEL_NONE: PathPointPanelSelection = { points: [], segments: [] };

/**
 * The selected points or stretches of a path in the inspector. Points show
 * their position, one row per axis, and Delete; stretches show their kind and
 * settings. With several selected, a field shows the value they share, or is
 * blank, and a typed value goes to all of them. Nothing shows while nothing is
 * selected; points and stretches are picked in the scene.
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
   * Shows the selected points and the selected stretches, or hides the panel.
   *
   * @param path Path.
   * @param selected Selected points and stretches.
   */
  show(path: PathAsset, selected: PathPointPanelSelection): void {
    const points = selected.points.filter((index) => index < path.points.length);
    const segments = selected.segments.filter((index) => index < path.segments.length);
    const rows = [...(points.length > 0 ? this.pointRows(path, points) : []), ...this.stretchRows(path, segments)];
    this.element.style.display = rows.length > 0 ? 'grid' : 'none';
    this.element.replaceChildren(...rows);
  }

  /**
   * Builds the rows of selected points: a caption, X, Y and Z, and Delete.
   *
   * @param path Path.
   * @param points Selected point indices.
   * @returns Rows.
   */
  private pointRows(path: PathAsset, points: readonly number[]): HTMLElement[] {
    const one = points.length === 1;
    const caption = one ? `Point ${points[0]! + 1} of ${path.points.length}` : `${points.length} Points`;
    const values = points.map((index) => path.points[index]!);
    const axes = this.vectorRows('Point', values, (axis, typed) =>
      this.onCommit(
        points.reduce(
          (moved, index) => pathAssetPointMove(moved, index, pathPointAxisSet(moved.points[index]!, axis, typed)),
          path,
        ),
      ),
    );
    const removed = pathAssetPointsRemove(path, points);
    const label = one ? 'Delete Point' : 'Delete Points';
    const remove = removed
      ? [modifierStackUiTextButton(label, 'Remove the selected points', () => this.onCommit(removed))]
      : [];
    return [modifierStackUiCaption(caption), ...axes, ...remove];
  }

  /**
   * Builds the rows of selected stretches: a caption, their kind, then their
   * settings.
   *
   * @param path Path.
   * @param indices Selected stretch indices.
   * @returns Rows; none without a selected stretch.
   */
  private stretchRows(path: PathAsset, indices: readonly number[]): HTMLElement[] {
    if (indices.length === 0) return [];
    const caption =
      indices.length === 1 ? `Stretch ${indices[0]! + 1} of ${path.segments.length}` : `${indices.length} Stretches`;
    return [modifierStackUiCaption(caption), this.kindRow(path, indices), ...this.settingRows(path, indices)];
  }

  /**
   * Builds the settings every selected stretch has, such as Arc Degrees or
   * Control; a typed value changes each of them.
   *
   * @param path Path.
   * @param indices Selected stretch indices.
   * @returns Rows.
   */
  private settingRows(path: PathAsset, indices: readonly number[]): HTMLElement[] {
    const segments = indices.map((index) => path.segments[index]!);
    const set = (change: (segment: PathAssetSegment) => Partial<PathAssetSegment>): void =>
      this.onCommit(
        indices.reduce((next, index) => {
          const segment = next.segments[index]!;
          return pathAssetSegmentSet(next, index, { ...segment, ...change(segment) });
        }, path),
      );
    const degrees = segments.map((segment) => segment.degrees);
    const arc = degrees.every((value) => value !== undefined)
      ? [this.degreesRow(degrees as number[], (value) => set(() => ({ degrees: value })))]
      : [];
    const handles = (['control', 'out', 'in', 'axis'] as const).flatMap((key) => {
      const values = segments.map((segment) => segment[key]);
      if (!values.every((value) => value !== undefined)) return [];
      return this.vectorRows(PATH_POINT_PANEL_HANDLES[key], values as PathAssetPoint[], (axis, typed) =>
        set((segment) => ({ [key]: pathPointAxisSet(segment[key]!, axis, typed) })),
      );
    });
    return [...arc, ...handles];
  }

  /**
   * Builds the Stretch row: the kind the selected stretches share, or blank.
   *
   * @param path Path.
   * @param indices Selected stretch indices.
   * @returns Row.
   */
  private kindRow(path: PathAsset, indices: readonly number[]): HTMLElement {
    const kind = new InputSelect(
      PATH_ASSET_SEGMENT_KINDS.map((each) => ({ value: each, label: each })),
      'Stretch',
    );
    kind.setSharedValues(indices.map((index) => path.segments[index]!.kind));
    kind.bindCommit(() => {
      const chosen = kind.getValue() as PathAssetSegmentKind;
      this.onCommit(indices.reduce((next, index) => pathAssetSegmentKindSet(next, index, chosen), path));
    });
    return modifierStackUiRow('Stretch', kind.getElement(), 'How the path runs on to the next point');
  }

  /**
   * Builds the Arc Degrees row: a sweep from 1 to 359 degrees either way.
   *
   * @param degrees Sweeps shown.
   * @param onChange Receives a typed sweep.
   * @returns Row.
   */
  private degreesRow(degrees: readonly number[], onChange: (degrees: number) => void): HTMLElement {
    const field = inputNumericCreateUvField(15, 'Arc Degrees');
    field.setSharedValues(degrees, 0);
    field.bindCommit(() => {
      const typed = field.parseNumberOrNull();
      if (typed === null || !Number.isFinite(typed) || typed === 0) return;
      onChange(Math.sign(typed) * Math.min(359, Math.max(1, Math.abs(typed))));
    });
    return modifierStackUiRow('Arc Degrees', field.getElement(), 'How far the arc turns; negative bends the other way');
  }

  /**
   * Builds one row per axis, as other vector settings in the inspector, each
   * showing the value the points share or blank.
   *
   * @param label Start of each row's name, such as Point.
   * @param values Shown points.
   * @param onChange Receives the axis and the typed number.
   * @returns X, Y and Z rows.
   */
  private vectorRows(
    label: string,
    values: readonly PathAssetPoint[],
    onChange: (axis: number, typed: number) => void,
  ): HTMLElement[] {
    return PATH_POINT_PANEL_AXES.map((letter, axis) => {
      const field = inputNumericCreateUvField(0.25, `${label} ${letter}`);
      field.setSharedValues(
        values.map((value) => value[axis]!),
        2,
      );
      field.bindCommit(() => {
        const typed = field.parseNumberOrNull();
        if (typed !== null && Number.isFinite(typed)) onChange(axis, typed);
      });
      return modifierStackUiRow(`${label} ${letter}`, field.getElement());
    });
  }
}

/**
 * Returns a point with one axis set.
 *
 * @param point Point.
 * @param axis Axis, 0 for x.
 * @param value New value.
 * @returns Changed point.
 */
function pathPointAxisSet(point: PathAssetPoint, axis: number, value: number): PathAssetPoint {
  return point.map((each, at) => (at === axis ? value : each)) as unknown as PathAssetPoint;
}
