import type { ProjectHistoryTreeRow } from '@/project/history/tree/project_history_tree_layout.js';
import { DIALOG_PROJECT_HISTORY_ACCENT } from './dialog_project_history_style.js';

/** A row center in pixels. */
export interface DialogProjectHistoryPoint {
  x: number;
  y: number;
}

/** Lane colors for branches off the path to the current work. */
const DIALOG_PROJECT_HISTORY_LANE_COLORS = ['#9db4cf', '#a9c58f', '#c7a3d6', '#d6c38f', '#8fcfc4'];
/** Fill inside the markers. */
const DIALOG_PROJECT_HISTORY_MARKER_FILL = '#202024';
/** SVG namespace. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draws the branch lines and state markers behind the rows.
 *
 * @param rows Placed rows.
 * @param centers Row centers.
 * @param marker Marker node id.
 * @param size Graph width and height.
 * @returns SVG element.
 */
export function dialogProjectHistoryGraph(
  rows: readonly ProjectHistoryTreeRow[],
  centers: ReadonlyMap<string, DialogProjectHistoryPoint>,
  marker: string | null,
  size: DialogProjectHistoryPoint,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size.x));
  svg.setAttribute('height', String(size.y));
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '2' });
  for (const row of rows) dialogProjectHistoryGraphLink(svg, row, centers);
  for (const row of rows) dialogProjectHistoryGraphMarker(svg, row, centers.get(row.id), row.id === marker);
  return svg;
}

/**
 * Picks the color of a row's lane.
 *
 * @param row Row.
 * @returns CSS color.
 */
function dialogProjectHistoryGraphColor(row: ProjectHistoryTreeRow): string {
  if (row.onPath) return DIALOG_PROJECT_HISTORY_ACCENT;
  const colors = DIALOG_PROJECT_HISTORY_LANE_COLORS;
  return colors[(row.lane - 1 + colors.length) % colors.length] ?? colors[0] ?? DIALOG_PROJECT_HISTORY_ACCENT;
}

/**
 * Draws the line from a row's parent to the row.
 *
 * @param svg Graph.
 * @param row Row.
 * @param centers Row centers.
 */
function dialogProjectHistoryGraphLink(
  svg: SVGSVGElement,
  row: ProjectHistoryTreeRow,
  centers: ReadonlyMap<string, DialogProjectHistoryPoint>,
): void {
  const from = row.parent === null ? undefined : centers.get(row.parent);
  const to = centers.get(row.id);
  if (from === undefined || to === undefined) return;
  const bend = Math.max(-26, (to.y - from.y) / 2);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    from.x === to.x
      ? `M${from.x} ${from.y} L${to.x} ${to.y}`
      : `M${from.x} ${from.y} C${from.x} ${from.y + bend} ${to.x} ${from.y + bend * 0.4} ${to.x} ${from.y + bend * 1.3} L${to.x} ${to.y}`,
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', dialogProjectHistoryGraphColor(row));
  path.setAttribute('stroke-width', row.onPath ? '2.5' : '2');
  if (row.node === null) path.setAttribute('stroke-dasharray', '3 4');
  svg.append(path);
}

/**
 * Draws a row's marker: a ring for "You Are Here", a circle for a named
 * snapshot, a square for an editing session, with a halo on the marker node.
 *
 * @param svg Graph.
 * @param row Row.
 * @param at Row center.
 * @param marked Whether the row is the marker node.
 */
function dialogProjectHistoryGraphMarker(
  svg: SVGSVGElement,
  row: ProjectHistoryTreeRow,
  at: DialogProjectHistoryPoint | undefined,
  marked: boolean,
): void {
  if (at === undefined) return;
  const accent = DIALOG_PROJECT_HISTORY_ACCENT;
  if (row.node === null) {
    svg.append(dialogProjectHistoryCircle(at, 12, [accent, 'none', '0'], '0.22'));
    svg.append(dialogProjectHistoryCircle(at, 7.5, [DIALOG_PROJECT_HISTORY_MARKER_FILL, accent, '2.5']));
    svg.append(dialogProjectHistoryCircle(at, 3, [accent, 'none', '0']));
    return;
  }
  if (marked) svg.append(dialogProjectHistoryCircle(at, 11, ['none', accent, '1.5']));
  const stroke = dialogProjectHistoryGraphColor(row);
  if (row.node.name !== '')
    svg.append(dialogProjectHistoryCircle(at, 7, [stroke, DIALOG_PROJECT_HISTORY_MARKER_FILL, '2']));
  else svg.append(dialogProjectHistorySquare(at, stroke));
}

/**
 * Builds an SVG circle.
 *
 * @param at Center.
 * @param r Radius.
 * @param paint Fill, stroke and stroke width.
 * @param opacity Opacity.
 * @returns Circle.
 */
function dialogProjectHistoryCircle(
  at: DialogProjectHistoryPoint,
  r: number,
  paint: readonly [string, string, string],
  opacity = '1',
): SVGElement {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(at.x));
  circle.setAttribute('cy', String(at.y));
  circle.setAttribute('r', String(r));
  circle.setAttribute('fill', paint[0]);
  circle.setAttribute('stroke', paint[1]);
  circle.setAttribute('stroke-width', paint[2]);
  circle.setAttribute('opacity', opacity);
  return circle;
}

/**
 * Builds the square marker of an editing session.
 *
 * @param at Center.
 * @param stroke Lane color.
 * @returns Square.
 */
function dialogProjectHistorySquare(at: DialogProjectHistoryPoint, stroke: string): SVGElement {
  const square = document.createElementNS(SVG_NS, 'rect');
  square.setAttribute('x', String(at.x - 4.5));
  square.setAttribute('y', String(at.y - 4.5));
  square.setAttribute('width', '9');
  square.setAttribute('height', '9');
  square.setAttribute('rx', '2');
  square.setAttribute('fill', DIALOG_PROJECT_HISTORY_MARKER_FILL);
  square.setAttribute('stroke', stroke);
  square.setAttribute('stroke-width', '2');
  return square;
}
