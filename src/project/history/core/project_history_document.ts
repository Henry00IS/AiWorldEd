import { projectAutosaveParse, type ProjectAutosaveDocument } from '@/project/autosave/project_autosave_files.js';

/**
 * Parses a Level History state file: a saved level, or a saved room turned into
 * a level document. Room states are converted on demand so the editor's offline
 * import graph does not load the collaboration runtime.
 *
 * @param text File contents.
 * @returns Document, or null when the file cannot be read.
 */
export async function projectHistoryDocumentParse(text: string): Promise<ProjectAutosaveDocument | null> {
  const document = projectAutosaveParse(text);
  if (document !== null) return document;
  const { snapshotCollaborationToDocument } =
    await import('@/collaboration/snapshot/document_collaboration_snapshot.js');
  return snapshotCollaborationToDocument(text);
}
