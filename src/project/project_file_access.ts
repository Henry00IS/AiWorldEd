/** Reads a file of the open project, or null without a project. */
let projectFileReader: ((path: string) => Promise<Blob>) | null = null;

/**
 * Registers how files of the open project are read; the project editor calls
 * this.
 *
 * @param reader File reader, or null when the project closes.
 */
export function projectFileReaderSet(reader: ((path: string) => Promise<Blob>) | null): void {
  projectFileReader = reader;
}

/**
 * Reads a file of the open project as a File named like its path.
 *
 * @param path Project path.
 * @returns File, or null without a project or when reading fails.
 */
export async function projectFileRead(path: string): Promise<File | null> {
  if (!projectFileReader) return null;
  try {
    const blob = await projectFileReader(path);
    const name = path.split('/').pop() || 'file';
    return blob instanceof File && blob.name === name ? blob : new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}
