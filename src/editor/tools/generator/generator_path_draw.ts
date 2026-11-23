import type * as THREE from 'three';
import {
  type WidgetScreenElements,
  widgetScreenProject,
} from '@/editor/widgets/screen_button/widget_screen_elements.js';
import type { EditorViewportPickContext } from '@/editor/window/editor_viewport_pick_context.js';
import type { ModifierStackPath } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import { pathAssetHandles, pathAssetStretchEnds, type PathAssetHandle } from '@/path/model/path_asset_edit.js';
import { pathEditSelected } from '@/path/edit/path_edit_selection.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import type { GeneratorEditHost } from './generator_edit_host.js';
import { generatorPathWalk, generatorPathWorld } from './generator_path_geometry.js';

/** Pointer distance in pixels that still grabs a point or handle. */
const GENERATOR_PATH_GRAB_PX = 8;

/** A point or handle under the pointer. */
export interface GeneratorPathTarget {
  /** Path it belongs to. */
  path: ModifierStackPath;
  /** Point index, or the stretch of a handle. */
  point: number;
  /** Handle, or null for a point. */
  handle: PathAssetHandle | null;
  /** False: a hit never adds a point. */
  add: false;
  /** World point of the point or handle. */
  anchor: THREE.Vector3;
  /** Pane it was hit in. */
  pane: EditorViewportPickContext;
}

/**
 * Returns the picked point when it belongs to a path of the edited object.
 *
 * @param host Edit host.
 * @returns Path and point index, or null.
 */
export function generatorPathPicked(host: GeneratorEditHost): { path: ModifierStackPath; point: number } | null {
  const picked = pathEditSelected();
  const path = host.paths().find((each) => each.stepId === picked?.stepId && each.name === picked.name);
  return path && picked && picked.point < path.path.points.length ? { path, point: picked.point } : null;
}

/**
 * Draws a path in a pane: its line, a dot per point, and the handles of the
 * picked point's stretch with lines to the points they bend.
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
  const walk = generatorPathWalk(path);
  walk.slice(1).forEach((to, index) => shown.add(lines.line(pane, `${path.key}:${index}`, walk[index]!, to)));
  const picked = pathEditSelected();
  const point = picked?.stepId === path.stepId && picked.name === path.name ? picked.point : null;
  path.path.points.forEach((each, index) => {
    const dot = dots.place(pane, `${path.key}:p${index}`, generatorPathWorld(path, each));
    dot.dataset['pathPointHandle'] = 'point';
    dot.dataset['selected'] = String(index === point);
    dot.style.background = index === point ? ThemeCss.accentColor : 'transparent';
    shown.add(dot);
  });
  if (point !== null) generatorPathHandlesDraw(dots, lines, pane, path, point, shown);
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
    const dot = dots.place(pane, `${path.key}:${handle}`, world);
    dot.dataset['pathPointHandle'] = handle;
    dot.style.borderRadius = '2px';
    shown.add(dot);
    const ends = handle === 'control' ? [start!, end!] : [handle === 'out' ? start! : end!];
    ends.forEach((each, index) => shown.add(lines.line(pane, `${path.key}:${handle}${index}`, each, world)));
  }
}

/**
 * Finds the point, or handle of the picked point's stretch, nearest a client
 * point within grabbing distance.
 *
 * @param host Edit host.
 * @param x Client X.
 * @param y Client Y.
 * @returns Target, or null.
 */
export function generatorPathHit(host: GeneratorEditHost, x: number, y: number): GeneratorPathTarget | null {
  const picked = generatorPathPicked(host);
  let best: { target: GeneratorPathTarget; distance: number } | null = null;
  for (const pane of host.panes()) {
    for (const target of generatorPathTargets(host.paths(), picked, pane)) {
      const screen = widgetScreenProject(target.anchor, pane);
      const distance = Math.hypot(screen.x - x, screen.y - y);
      if (screen.visible && distance <= GENERATOR_PATH_GRAB_PX && (!best || distance < best.distance))
        best = { target, distance };
    }
  }
  return best?.target ?? null;
}

/**
 * Lists what can be grabbed in a pane: every point, and the handles of the
 * picked point's stretch.
 *
 * @param paths Path inputs.
 * @param picked Picked point, or null.
 * @param pane Pane.
 * @returns Targets.
 */
function generatorPathTargets(
  paths: readonly ModifierStackPath[],
  picked: { path: ModifierStackPath; point: number } | null,
  pane: EditorViewportPickContext,
): GeneratorPathTarget[] {
  const target = (path: ModifierStackPath, point: number, handle: PathAssetHandle | null, at: THREE.Vector3) =>
    ({ path, point, handle, add: false, anchor: at, pane }) as const;
  const points = paths.flatMap((path) =>
    path.path.points.map((each, index) => target(path, index, null, generatorPathWorld(path, each))),
  );
  const handles = picked
    ? pathAssetHandles(picked.path.path, picked.point).map((each) =>
        target(picked.path, picked.point, each.handle, generatorPathWorld(picked.path, each.point)),
      )
    : [];
  return [...handles, ...points];
}

/**
 * Creates a path element in a document that never takes the pointer: a solid
 * line piece, or a dot that fills in when its point is picked.
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
