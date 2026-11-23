/** The point of a Path input picked in the scene. */
export interface PathEditSelection {
  /** Id of the step whose input holds the path. */
  stepId: string;
  /** Name of the Path input. */
  name: string;
  /** Index of the point. */
  point: number;
}

/** Point picked now, shared by the scene and the inspector. */
const PATH_EDIT_SELECTION: { current: PathEditSelection | null; listeners: Set<() => void> } = {
  current: null,
  listeners: new Set(),
};

/**
 * Returns the picked point.
 *
 * @returns Picked point, or null.
 */
export function pathEditSelected(): PathEditSelection | null {
  return PATH_EDIT_SELECTION.current;
}

/**
 * Picks a point, or none, and tells every listener.
 *
 * @param selection Picked point, or null.
 */
export function pathEditSelect(selection: PathEditSelection | null): void {
  PATH_EDIT_SELECTION.current = selection;
  for (const listener of [...PATH_EDIT_SELECTION.listeners]) listener();
}

/**
 * Listens for the picked point to change.
 *
 * @param listener Called after each change.
 * @returns Stops listening.
 */
export function pathEditSelectionListen(listener: () => void): () => void {
  PATH_EDIT_SELECTION.listeners.add(listener);
  return () => PATH_EDIT_SELECTION.listeners.delete(listener);
}
