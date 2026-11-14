import { SCENE_FILE_EXTENSION } from '@/io/scene_file/scene_file_extension.js';
import type { SceneFileHandle } from '@/io/scene_file/scene_file_session.js';

/** A level file dropped on the editor. */
export interface SceneFileDropLevel {
  /** Dropped file. */
  file: File;
  /** Handle Save can write back through, or null when the browser gives none. */
  handle: Promise<SceneFileHandle | null> | null;
}

/** Drag item with the optional file system handle accessor. */
interface SceneFileDropItem {
  kind: string;
  getAsFile(): File | null;
  getAsFileSystemHandle?(): Promise<unknown>;
}

/**
 * Listens for files dropped anywhere on the editor. Elements that take file
 * drops themselves (such as the chat window) handle them first; what reaches
 * this target opens when it is a level file and is otherwise kept from
 * replacing the page.
 */
export class SceneFileDropTarget {
  private readonly onDragOver = (event: Event) => this.dragOver(event as DragEvent);
  private readonly onDrop = (event: Event) => this.drop(event as DragEvent);

  /**
   * @param target Document or element that receives the drops.
   * @param onLevel Opens a dropped level file.
   * @param onOtherFiles Runs when dropped files hold no level file.
   */
  constructor(
    private readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    private readonly onLevel: (level: SceneFileDropLevel) => void,
    private readonly onOtherFiles: () => void,
  ) {
    target.addEventListener('dragover', this.onDragOver);
    target.addEventListener('drop', this.onDrop);
  }

  /** Stops listening. */
  dispose(): void {
    this.target.removeEventListener('dragover', this.onDragOver);
    this.target.removeEventListener('drop', this.onDrop);
  }

  /**
   * Accepts file drags no element took, so their drop reaches the editor.
   *
   * @param event Drag event.
   */
  private dragOver(event: DragEvent): void {
    if (event.defaultPrevented || !sceneFileDropCarriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
  }

  /**
   * Opens a dropped level file; other dropped files are ignored.
   *
   * @param event Drop event.
   */
  private drop(event: DragEvent): void {
    if (event.defaultPrevented || !sceneFileDropCarriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    const level = sceneFileDropLevelPick(event.dataTransfer);
    if (level === null) this.onOtherFiles();
    else this.onLevel(level);
  }
}

/**
 * Tells whether a drag carries files from outside the page.
 *
 * @param data Drag data, or null.
 * @returns True for file drags.
 */
export function sceneFileDropCarriesFiles(data: DataTransfer | null): data is DataTransfer {
  return data !== null && Array.from(data.types).includes('Files');
}

/**
 * Finds the first level file among dropped files. The file handle is asked for
 * during the drop, while the browser still allows it.
 *
 * @param data Drop data.
 * @returns Level file and handle, or null without a level file.
 */
export function sceneFileDropLevelPick(data: DataTransfer): SceneFileDropLevel | null {
  const items = Array.from(data.items as ArrayLike<SceneFileDropItem>).filter((item) => item.kind === 'file');
  for (const item of items) {
    const file = item.getAsFile();
    if (file === null || !sceneFileDropNameIsLevel(file.name)) continue;
    return { file, handle: sceneFileDropHandle(item) };
  }
  return null;
}

/**
 * Tells whether a file name is a level file.
 *
 * @param name File name.
 * @returns True for .aiworld files.
 */
export function sceneFileDropNameIsLevel(name: string): boolean {
  return name.toLowerCase().endsWith(`.${SCENE_FILE_EXTENSION}`);
}

/**
 * Asks the browser for a dropped file's handle, where supported.
 *
 * @param item Dropped item.
 * @returns Handle promise, or null when the browser has no handles.
 */
function sceneFileDropHandle(item: SceneFileDropItem): Promise<SceneFileHandle | null> | null {
  if (typeof item.getAsFileSystemHandle !== 'function') return null;
  return item
    .getAsFileSystemHandle()
    .then((handle) => (sceneFileDropHandleIsFile(handle) ? handle : null))
    .catch(() => null);
}

/**
 * Tells whether a handle is a writable file handle.
 *
 * @param handle Handle the browser returned.
 * @returns True for file handles.
 */
function sceneFileDropHandleIsFile(handle: unknown): handle is SceneFileHandle {
  const candidate = handle as { kind?: unknown; getFile?: unknown } | null;
  return candidate !== null && candidate.kind === 'file' && typeof candidate.getFile === 'function';
}
