/** Hands out increasing modification times so every write looks new. */
let projectMockClock = 1_700_000_000_000;

/**
 * Returns the next modification time.
 *
 * @returns Milliseconds.
 */
function projectMockNow(): number {
  projectMockClock += 1000;
  return projectMockClock;
}

/**
 * Builds a DOMException with a name.
 *
 * @param name Exception name.
 * @param message Message.
 * @returns Exception.
 */
function projectMockError(name: string, message: string): DOMException {
  return new DOMException(message, name);
}

/** In-memory FileSystemFileHandle. */
export class ProjectMockFileHandle {
  readonly kind = 'file';
  readonly name: string;
  data: Blob;
  lastModified: number;
  writes = 0;
  failWrite = false;

  /**
   * Creates a file.
   *
   * @param name File name.
   * @param data Contents.
   * @param lastModified Modification time.
   */
  constructor(name: string, data: Blob, lastModified: number) {
    this.name = name;
    this.data = data;
    this.lastModified = lastModified;
  }

  /**
   * Returns the file contents.
   *
   * @returns File.
   */
  async getFile(): Promise<File> {
    return new File([this.data], this.name, { lastModified: this.lastModified, type: this.data.type });
  }

  /**
   * Opens a swap-file writer that replaces the contents on close.
   *
   * @returns Writer.
   */
  async createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }> {
    let pending: Blob | null = null;
    return {
      write: async (data) => {
        if (this.failWrite) throw projectMockError('QuotaExceededError', 'disk full');
        pending = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
      },
      close: async () => this.commit(pending),
      abort: async () => undefined,
    };
  }

  /**
   * Replaces the contents.
   *
   * @param data New contents, or null for none.
   */
  private commit(data: Blob | null): void {
    if (data === null) return;
    this.data = data;
    this.lastModified = projectMockNow();
    this.writes += 1;
  }
}

/** In-memory FileSystemDirectoryHandle with helpers for tests. */
export class ProjectMockDirectoryHandle {
  readonly kind = 'directory';
  readonly name: string;
  readonly children = new Map<string, ProjectMockDirectoryHandle | ProjectMockFileHandle>();
  permission: PermissionState = 'granted';
  permissionAfterRequest: PermissionState = 'granted';
  listCalls = 0;

  /**
   * Creates a folder.
   *
   * @param name Folder name.
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Lists children.
   *
   * @yields Child handles.
   */
  async *values(): AsyncIterableIterator<ProjectMockDirectoryHandle | ProjectMockFileHandle> {
    this.listCalls += 1;
    for (const child of [...this.children.values()]) yield child;
  }

  /**
   * Lists named children.
   *
   * @yields Name and handle pairs.
   */
  async *entries(): AsyncIterableIterator<[string, ProjectMockDirectoryHandle | ProjectMockFileHandle]> {
    for (const [name, child] of [...this.children]) yield [name, child];
  }

  /**
   * Opens a sub-folder.
   *
   * @param name Folder name.
   * @param options Whether to create it.
   * @returns Folder.
   */
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectMockDirectoryHandle> {
    const child = this.children.get(name);
    if (child instanceof ProjectMockDirectoryHandle) return child;
    if (child !== undefined) throw projectMockError('TypeMismatchError', `${name} is a file`);
    if (options?.create !== true) throw projectMockError('NotFoundError', `${name} not found`);
    const created = new ProjectMockDirectoryHandle(name);
    this.children.set(name, created);
    return created;
  }

  /**
   * Opens a file.
   *
   * @param name File name.
   * @param options Whether to create it.
   * @returns File.
   */
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<ProjectMockFileHandle> {
    const child = this.children.get(name);
    if (child instanceof ProjectMockFileHandle) return child;
    if (child !== undefined) throw projectMockError('TypeMismatchError', `${name} is a folder`);
    if (options?.create !== true) throw projectMockError('NotFoundError', `${name} not found`);
    const created = new ProjectMockFileHandle(name, new Blob([]), projectMockNow());
    this.children.set(name, created);
    return created;
  }

  /**
   * Deletes a child.
   *
   * @param name Child name.
   */
  async removeEntry(name: string): Promise<void> {
    if (!this.children.delete(name)) throw projectMockError('NotFoundError', `${name} not found`);
  }

  /**
   * Returns the current permission.
   *
   * @returns Permission.
   */
  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  /**
   * Grants or denies permission like a prompt would.
   *
   * @returns Permission after the prompt.
   */
  async requestPermission(): Promise<PermissionState> {
    this.permission = this.permissionAfterRequest;
    return this.permission;
  }

  /**
   * Writes a file at a slash path, creating folders.
   *
   * @param path File path.
   * @param content Contents.
   * @param type MIME type.
   * @returns File handle.
   */
  put(path: string, content: string | Uint8Array, type = ''): ProjectMockFileHandle {
    const segments = path.split('/');
    const folder = this.folderAt(segments.slice(0, -1), true) as ProjectMockDirectoryHandle;
    const name = segments[segments.length - 1] as string;
    const file = new ProjectMockFileHandle(name, new Blob([content as BlobPart], { type }), projectMockNow());
    folder.children.set(name, file);
    return file;
  }

  /**
   * Deletes a file or folder at a slash path.
   *
   * @param path Path.
   */
  delete(path: string): void {
    const segments = path.split('/');
    this.folderAt(segments.slice(0, -1), false)?.children.delete(segments[segments.length - 1] as string);
  }

  /**
   * Moves a file, keeping its contents and time.
   *
   * @param from Old path.
   * @param to New path.
   */
  move(from: string, to: string): void {
    const source = this.handleAt(from);
    if (!(source instanceof ProjectMockFileHandle)) throw new Error(`No file at ${from}`);
    this.delete(from);
    const segments = to.split('/');
    const folder = this.folderAt(segments.slice(0, -1), true) as ProjectMockDirectoryHandle;
    const name = segments[segments.length - 1] as string;
    folder.children.set(name, new ProjectMockFileHandle(name, source.data, source.lastModified));
  }

  /**
   * Returns the handle at a slash path.
   *
   * @param path Path.
   * @returns Handle, or undefined.
   */
  handleAt(path: string): ProjectMockDirectoryHandle | ProjectMockFileHandle | undefined {
    const segments = path.split('/');
    return this.folderAt(segments.slice(0, -1), false)?.children.get(segments[segments.length - 1] as string);
  }

  /**
   * Reads a file's text at a slash path.
   *
   * @param path Path.
   * @returns Text, or null when missing.
   */
  async textAt(path: string): Promise<string | null> {
    const handle = this.handleAt(path);
    return handle instanceof ProjectMockFileHandle ? handle.data.text() : null;
  }

  /**
   * Returns this folder typed as a browser handle.
   *
   * @returns Handle.
   */
  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }

  /**
   * Walks to a folder.
   *
   * @param segments Folder names.
   * @param create Whether to create missing folders.
   * @returns Folder, or null.
   */
  private folderAt(segments: readonly string[], create: boolean): ProjectMockDirectoryHandle | null {
    let folder: ProjectMockDirectoryHandle = this;
    for (const segment of segments) {
      let child = folder.children.get(segment);
      if (child === undefined && create)
        folder.children.set(segment, (child = new ProjectMockDirectoryHandle(segment)));
      if (!(child instanceof ProjectMockDirectoryHandle)) return null;
      folder = child;
    }
    return folder;
  }
}

/** One-pixel PNG bytes, recognised by texture sniffing. */
export const PROJECT_MOCK_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d,
  0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
