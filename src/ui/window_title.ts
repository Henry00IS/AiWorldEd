import { APPLICATION_VERSION, buildWindowTitle } from '@/application_identity.js';

declare global {
  interface Window {
    /** Sets the native desktop window title to match document.title. */
    aiworldedSetWindowTitle?: (title: string) => void;
    /** Installed desktop application version, when running in the desktop app. */
    aiworldedAppVersion?: string;
  }
}

/** Options of an editor window title that can be applied to a document. */
export interface EditorWindowTitleOptions {
  /** True in the desktop app, where the installed version is shown. */
  includeVersion: boolean;
  /** Installed application version used when {@link includeVersion} is true. */
  version?: string;
  /** Writes the title to the document and, on desktop, the native window. */
  setTitle: (title: string) => void;
}

/** Session and room fields needed to choose a room window title. */
export interface EditorWindowTitleRoomSource {
  /** Joined room session, or null outside a room. */
  session: object | null;
  /** Joined room, or null outside a room. */
  room: { name: string } | null;
}

/** Live editor window title: file name, room name, and where to write it. */
export class EditorWindowTitle {
  private fileName: string | null;
  private roomName: string | null;

  /**
   * Creates a title that starts untitled, with no room.
   *
   * @param options Desktop flag, version, and writer.
   */
  constructor(private readonly options: EditorWindowTitleOptions) {
    this.fileName = null;
    this.roomName = null;
  }

  /**
   * Remembers the active save file and writes the title.
   *
   * @param pathOrName File name or path, or null when untitled.
   */
  setFileName(pathOrName: string | null): void {
    this.fileName = windowTitleFileName(pathOrName);
    this.apply();
  }

  /**
   * Remembers the joined room and writes the title.
   *
   * @param name Room name, or null when not in a room.
   */
  setRoomName(name: string | null): void {
    const trimmed = name?.trim() ?? '';
    this.roomName = trimmed.length > 0 ? trimmed : null;
    this.apply();
  }

  /** Writes the current title. */
  apply(): void {
    this.options.setTitle(
      buildWindowTitle({
        fileName: this.fileName,
        roomName: this.roomName,
        includeVersion: this.options.includeVersion,
        ...(this.options.version === undefined ? {} : { version: this.options.version }),
      }),
    );
  }
}

/** Installed title used by the running editor, if any. */
let installed: EditorWindowTitle | null = null;

/**
 * Installs the live window title used by file and room updates.
 *
 * @param title Title to install.
 */
export function editorWindowTitleInstall(title: EditorWindowTitle): void {
  installed = title;
  title.apply();
}

/** Removes the installed title, for tests. */
export function editorWindowTitleUninstall(): void {
  installed = null;
}

/**
 * Updates the installed title's active save file.
 *
 * @param pathOrName File name or path, or null when untitled.
 */
export function editorWindowTitleSetFile(pathOrName: string | null): void {
  installed?.setFileName(pathOrName);
}

/**
 * Updates the installed title's joined room.
 *
 * @param name Room name, or null when not in a room.
 */
export function editorWindowTitleSetRoom(name: string | null): void {
  installed?.setRoomName(name);
}

/**
 * Returns the room name to show in the window title.
 *
 * @param source Current session and room.
 * @returns Room name, or null when no session is joined.
 */
export function editorWindowTitleRoomFrom(source: EditorWindowTitleRoomSource): string | null {
  if (source.session === null) return null;
  const name = source.room?.name.trim() ?? '';
  return name.length > 0 ? name : null;
}

/**
 * Returns the file name (with extension) of a path or name.
 *
 * @param pathOrName File name or path.
 * @returns File name, or null when missing or blank.
 */
export function windowTitleFileName(pathOrName: string | null | undefined): string | null {
  const raw = pathOrName?.trim() ?? '';
  if (raw === '') return null;
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? raw;
  const trimmed = base.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Tells whether the editor is running inside the desktop app.
 *
 * @returns True when the native title bridge is present.
 */
export function editorWindowTitleIsDesktop(): boolean {
  return typeof window !== 'undefined' && typeof window.aiworldedSetWindowTitle === 'function';
}

/**
 * Returns the version shown in the desktop window title.
 *
 * @returns Installed desktop version, or the packaged version.
 */
export function editorWindowTitleVersion(): string {
  const injected = typeof window !== 'undefined' ? window.aiworldedAppVersion : undefined;
  const trimmed = injected?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : APPLICATION_VERSION;
}

/**
 * Writes the title to the document and, on desktop, the native window.
 *
 * @param title Title text.
 */
export function editorWindowTitleWrite(title: string): void {
  if (typeof document !== 'undefined') document.title = title;
  if (typeof window !== 'undefined') window.aiworldedSetWindowTitle?.(title);
}
