/** Folder of the project that saved curves go into. */
export const CURVE_PROJECT_FOLDER = 'curves';

/** How curve tools read and write files of the open project. */
export interface CurveProjectAccess {
  /** Returns whether files can be written. */
  writable: () => boolean;
  /** Reads a project file as text. */
  read: (path: string) => Promise<string>;
  /** Writes a project file. */
  write: (path: string, text: string) => Promise<void>;
}

/** The open project's file access, or null without a project. */
let curveProjectAccessCurrent: CurveProjectAccess | null = null;

/**
 * Registers the open project's file access; the project editor calls this.
 *
 * @param access File access, or null when the project closes.
 */
export function curveProjectAccessSet(access: CurveProjectAccess | null): void {
  curveProjectAccessCurrent = access;
}

/**
 * Returns the open project's file access.
 *
 * @returns File access, or null.
 */
export function curveProjectAccess(): CurveProjectAccess | null {
  return curveProjectAccessCurrent;
}
