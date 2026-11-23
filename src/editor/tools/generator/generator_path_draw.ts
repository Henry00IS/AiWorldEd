import * as THREE from 'three';
import {
  type WidgetScreenElements,
  widgetScreenProject,
} from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import { pathAssetHandles, pathAssetStretchEnds, type PathAssetHandle } from '@/path/model/path_asset_edit.js';
import { pathEditSelected, type PathEditSelection } from '@/path/edit/path_edit_selection.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { generatorPathStretchWalks, generatorPathWorld } from './generator_path_geometry.js';

/** Pointer distance in pixels that still grabs a point or handle. */
const GENERATOR_PATH_GRAB_PX = 8;

/** Pointer distance in pixels from a stretch's line that still picks it. */
const GENERATOR_PATH_LINE_PX = 5;

/** A point, handle or stretch under the pointer. */
export interface GeneratorPathTarget {
  /** Path it belongs to. */
  path: ModifierStackPath;
  /** What was hit: a point, a handle of a stretch, or a stretch's line. */
  kind: 'point' | 'handle' | 'segment';
  /** Point index, or the stretch of a handle or line. */
  point: number;
  /** Handle, or null for a point or a line. */
  handle: PathAssetHandle | null;
  /** World point of the point or handle, or of the hit on the line. */
  anchor: THREE.Vector3;
  /** Pane it was hit in. */
  pane: EditorViewportPickContext;
}

/**
 * Returns the selection when it belongs to a path of the edited object.
 *
 * @param host Edit host.
 * @returns Path and selection, or null.
 */
export function generatorPathPicked(
  host: GeneratorEditHost,
): { path: ModifierStackPath; selection: PathEditSelection } | null {
  const selection = pathEditSelected();
  const path = host.paths().find((each) => each.stepId === selection?.stepId && each.name === selection.name);
  return path && selection ? { path, selection } : null;
}

/**
 * Returns the stretches whose handles show: the selected stretches and those
 * leaving selected points.
 *
 * @param path Path.
 * @param selection Selection of the path, or null.
 * @returns Stretch indices.
 */
function generatorPathHandleStretches(path: ModifierStackPath, selection: PathEditSelection | null): number[] {
  const all = [...(selection?.segments ?? []), ...(selection?.points ?? [])];
  return [...new Set(all)].filter((index) => index < path.path.segments.length);
}

/**
 * Returns the selection of one path, or null.
 *
 * @param path Path.
 * @returns Selection, or null when another path or nothing is selected.
 */
function generatorPathSelectionOf(path: ModifierStackPath): PathEditSelection | null {
  const selection = pathEditSelected();
  return selection?.stepId === path.stepId && selection.name === path.name ? selection : null;
}

/**
 * Draws a path in a pane: the line of each stretch, thicker when selected, a
 * dot per point, filled when selected, and the handles of the shown stretches.
 *
 * @param dots Dot elements.
 * @param lines Line elements.
 * @param pane Pane.
 * @param path Path input.
 * @param shown Receives every element shown.
 */
export function generatorPathDraw(
  dots: WidgetScreenElements,
  lines: WidgetScreenElements,
  pane: EditorViewportPickContext,
  path: ModifierStackPath,
  shown: Set<HTMLElement>,
): void {
  const selection = generatorPathSelectionOf(path);
  generatorPathStretchWalks(path).forEach((walk, stretch) => {
    const selected = String(selection?.segments.includes(stretch) === true);
    walk.slice(1).forEach((to, index) => {
      const line = lines.line(pane, `${path.key}:${stretch}:${index}`, walk[index]!, to);
      line.dataset['selected'] = selected;
      line.style.borderTopWidth = selected === 'true' ? '4px' : '2px';
      shown.add(line);
    });
  });
  path.path.points.forEach((each, index) => {
    const dot = dots.place(pane, `${path.key}:p${index}`, generatorPathWorld(path, each));
    const selected = selection?.points.includes(index) === true;
    dot.dataset['pathPointHandle'] = 'point';
    dot.dataset['selected'] = String(selected);
    dot.style.background = selected ? ThemeCss.accentColor : 'transparent';
    shown.add(dot);
  });
  for (const stretch of generatorPathHandleStretches(path, selection))
    generatorPathHandlesDraw(dots, lines, pane, path, stretch, shown);
}

/**
 * Draws the handles of a stretch, each with a line to the points it bends.
 *
 * @param dots Dot elements.
 * @param lines Line elements.
 * @param pane Pane.
 * @param path Path input.
 * @param stretch Stretch index.
 * @param shown Receives every element shown.
 */
function generatorPathHandlesDraw(
  dots: WidgetScreenElements,
  lines: WidgetScreenElements,
  pane: EditorViewportPickContext,
  path: ModifierStackPath,
  stretch: number,
  shown: Set<HTMLElement>,
): void {
  const [start, end] = pathAssetStretchEnds(path.path, stretch).map((each) => generatorPathWorld(path, each));
  for (const { handle, point } of pathAssetHandles(path.path, stretch)) {
    const world = generatorPathWorld(path, point);
    const dot = dots.place(pane, `${path.key}:${stretch}:${handle}`, world);
    dot.dataset['pathPointHandle'] = handle;
    dot.style.borderRadius = '2px';
    shown.add(dot);
    const ends = handle === 'control' ? [start!, end!] : [handle === 'out' ? start! : end!];
    ends.forEach((each, index) => shown.add(lines.line(pane, `${path.key}:${stretch}:${handle}${index}`, each, world)));
  }
}

/**
 * Finds the point or shown handle nearest a client point within grabbing
 * distance, or else the stretch whose line runs nearest it.
 *
 * @param host Edit host.
 * @param x Client X.
 * @param y Client Y.
 * @returns Target, or null.
 */
export function generatorPathHit(host: GeneratorEditHost, x: number, y: number): GeneratorPathTarget | null {
  let best: { target: GeneratorPathTarget; distance: number } | null = null;
  for (const pane of host.panes()) {
    for (const target of generatorPathTargets(host.paths(), pane)) {
      const screen = widgetScreenProject(target.anchor, pane);
      const distance = Math.hypot(screen.x - x, screen.y - y);
      if (screen.visible && distance <= GENERATOR_PATH_GRAB_PX && (!best || distance < best.distance))
        best = { target, distance };
    }
  }
  return best?.target ?? generatorPathLineHit(host, x, y);
}

/**
 * Lists what can be grabbed in a pane: the shown handles, then every point.
 *
 * @param paths Path inputs.
 * @param pane Pane.
 * @returns Targets.
 */
function generatorPathTargets(
  paths: readonly ModifierStackPath[],
  pane: EditorViewportPickContext,
): GeneratorPathTarget[] {
  return paths.flatMap((path) => {
    const handles = generatorPathHandleStretches(path, generatorPathSelectionOf(path)).flatMap((stretch) =>
      pathAssetHandles(path.path, stretch).map(({ handle, point }) => ({
        path,
        kind: 'handle' as const,
        point: stretch,
        handle,
        anchor: generatorPathWorld(path, point),
        pane,
      })),
    );
    const points = path.path.points.map((each, index) => ({
      path,
      kind: 'point' as const,
      point: index,
      handle: null,
      anchor: generatorPathWorld(path, each),
      pane,
    }));
    return [...handles, ...points];
  });
}

/**
 * Finds the stretch whose drawn line runs nearest a client point, within
 * picking distance.
 *
 * @param host Edit host.
 * @param x Client X.
 * @param y Client Y.
 * @returns Stretch target, or null.
 */
function generatorPathLineHit(host: GeneratorEditHost, x: number, y: number): GeneratorPathTarget | null {
  let best: { target: GeneratorPathTarget; distance: number } | null = null;
  for (const pane of host.panes())
    for (const path of host.paths())
      for (const [stretch, walk] of generatorPathStretchWalks(path).entries()) {
        const distance = generatorPathScreenDistance(walk, pane, x, y);
        if (distance > GENERATOR_PATH_LINE_PX || (best && distance >= best.distance)) continue;
        best = { target: { path, kind: 'segment', point: stretch, handle: null, anchor: walk[0]!, pane }, distance };
      }
  return best?.target ?? null;
}

/**
 * Returns the screen distance from a client point to a world line.
 *
 * @param walk World points of the line.
 * @param pane Pane.
 * @param x Client X.
 * @param y Client Y.
 * @returns Distance in pixels; Infinity when no piece is in view.
 */
function generatorPathScreenDistance(
  walk: readonly THREE.Vector3[],
  pane: EditorViewportPickContext,
  x: number,
  y: number,
): number {
  const screen = walk.map((each) => widgetScreenProject(each, pane));
  let nearest = Infinity;
  for (let index = 1; index < screen.length; index++) {
    const [from, to] = [screen[index - 1]!, screen[index]!];
    if (!from.visible || !to.visible) continue;
    const piece = new THREE.Line3(new THREE.Vector3(from.x, from.y, 0), new THREE.Vector3(to.x, to.y, 0));
    const closest = piece.closestPointToPoint(new THREE.Vector3(x, y, 0), true, new THREE.Vector3());
    nearest = Math.min(nearest, Math.hypot(closest.x - x, closest.y - y));
  }
  return nearest;
}

/**
 * Creates a path element in a document that never takes the pointer: a solid
 * line piece, or a dot that fills in when its point is selected.
 *
 * @param doc Document of the pane.
 * @param line True for a line piece.
 * @returns Element.
 */
export function generatorPathElementCreate(doc: Document, line: boolean): HTMLElement {
  const element = doc.createElement('div');
  if (line) element.dataset['pathLine'] = 'true';
  Object.assign(element.style, line ? GENERATOR_PATH_LINE_STYLE : GENERATOR_PATH_DOT_STYLE);
  doc.body.append(element);
  return element;
}

/** Inline style of a line piece. */
const GENERATOR_PATH_LINE_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  height: '0',
  borderTop: `2px solid ${ThemeCss.accentColor}`,
  transformOrigin: '0 0',
  pointerEvents: 'none',
  zIndex: '4',
};

/** Inline style of a point or handle dot. */
const GENERATOR_PATH_DOT_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  width: '10px',
  height: '10px',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  border: `2px solid ${ThemeCss.accentColor}`,
  boxSizing: 'border-box',
  pointerEvents: 'none',
  zIndex: '5',
};
