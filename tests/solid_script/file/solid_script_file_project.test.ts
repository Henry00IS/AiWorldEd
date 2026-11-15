import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import {
  SOLID_SCRIPT_PROJECT_DIRECTORY,
  solidScriptProjectFileName,
  solidScriptProjectList,
  solidScriptProjectLoad,
  solidScriptProjectSave,
} from '@/solid_script/file/solid_script_file_project.js';
import { solidScriptDocumentFromSource } from '@/solid_script/document/solid_script_document_source.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';

describe('scripts in the project folder', () => {
  it('saves into AiWorldEd/Scripts, lists saved scripts by name and loads them back', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.put(`${SOLID_SCRIPT_PROJECT_DIRECTORY}/notes.txt`, 'not a script');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    const document = solidScriptDocumentFromSource('cube([1, 2, 3]);');
    const fileName = await solidScriptProjectSave(fileSystem, 'Tall Box', document);
    expect(fileName).toBe('Tall Box.aiscript');
    await solidScriptProjectSave(fileSystem, 'Arch', document);
    expect(await solidScriptProjectList(fileSystem)).toEqual(['Arch.aiscript', 'Tall Box.aiscript']);
    const loaded = await solidScriptProjectLoad(fileSystem, 'Tall Box.aiscript');
    expect(loaded.name).toBe('Tall Box');
    expect(loaded.document.blocks).toEqual(document.blocks);
  });

  it('makes safe file names and rejects empty ones', () => {
    expect(solidScriptProjectFileName('  Door / Frame: v2 ')).toBe('Door - Frame- v2.aiscript');
    expect(solidScriptProjectFileName('Ramp.aiscript')).toBe('Ramp.aiscript');
    expect(() => solidScriptProjectFileName(' ./ ')).toThrow(/name/);
  });
});
