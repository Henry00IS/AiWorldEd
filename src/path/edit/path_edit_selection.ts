/** The points and stretches of a path selected in the scene. */
export interface PathEditSelection {
  /** Id of the step whose input holds the path. */
  stepId: string;
  /** Name of the Path input. */
  name: string;
  /** Selected point indices, in order. */
  points: readonly number[];
  /**
   * Selected stretch indices, in order; a stretch runs from its point to the
   * next.
   */
  segments: readonly number[];
}

/**
 * How a click or a box changes a selection: replace it, add to it or toggle in
 * it.
 */
export type PathEditSelectMode = 'replace' | 'add' | 'toggle';

/** Selection now, shared by the scene and the inspector. */
const PATH_EDIT_SELECTION: { current: PathEditSelection | null; listeners: Set<() => void> } = {
  current: null,
  listeners: new Set(),
};

/**
 * Returns the selection.
 *
 * @returns Selection, or null.
 */
export function pathEditSelected(): PathEditSelection | null {
  return PATH_EDIT_SELECTION.current;
}

/**
 * Sets the selection, or none, and tells every listener.
 *
 * @param selection Selection, or null.
 */
export function pathEditSelect(selection: PathEditSelection | null): void {
  PATH_EDIT_SELECTION.current = selection;
  for (const listener of [...PATH_EDIT_SELECTION.listeners]) listener();
}

/**
 * Listens for the selection to change.
 *
 * @param listener Called after each change.
 * @returns Stops listening.
 */
export function pathEditSelectionListen(listener: () => void): () => void {
  PATH_EDIT_SELECTION.listeners.add(listener);
  return () => PATH_EDIT_SELECTION.listeners.delete(listener);
}

/**
 * Returns the selection after points or stretches of one path are clicked or
 * boxed: Replace keeps only them, Add adds them and Toggle flips each. A path
 * other than the selected one starts a new selection.
 *
 * @param current Selection now, or null.
 * @param path Step id and input name of the path.
 * @param picked Points and stretches clicked or boxed.
 * @param mode How the selection changes.
 * @returns New selection.
 */
export function pathEditSelectionChange(
  current: PathEditSelection | null,
  path: { stepId: string; name: string },
  picked: { points: readonly number[]; segments: readonly number[] },
  mode: PathEditSelectMode,
): PathEditSelection {
  const same = current?.stepId === path.stepId && current.name === path.name && mode !== 'replace';
  return {
    stepId: path.stepId,
    name: path.name,
    points: pathEditIndicesChange(same ? current.points : [], picked.points, mode),
    segments: pathEditIndicesChange(same ? current.segments : [], picked.segments, mode),
  };
}

/**
 * Adds or toggles indices in a sorted list.
 *
 * @param current Indices now.
 * @param picked Indices clicked or boxed.
 * @param mode Toggle flips each; otherwise each is added.
 * @returns Sorted indices.
 */
function pathEditIndicesChange(
  current: readonly number[],
  picked: readonly number[],
  mode: PathEditSelectMode,
): number[] {
  const next = new Set(current);
  for (const index of picked) {
    if (mode === 'toggle' && next.has(index)) next.delete(index);
    else next.add(index);
  }
  return [...next].sort((a, b) => a - b);
}
