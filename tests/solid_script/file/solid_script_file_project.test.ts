import { describe, expect, it } from 'vitest';
import { ProjectFileSystemHandle } from '@/project/fs/project_file_system_handle.js';
import {
  SOLID_SCRIPT_PROJECT_DIRECTORY,
  solidScriptProjectFileName,
  solidScriptProjectList,
  solidScriptProjectLoad,
  solidScriptProjectRead,
  solidScriptProjectSave,
} from '@/solid_script/file/solid_script_file_project.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { ProjectMockDirectoryHandle } from '../../project/fs/project_mock_directory_handle.js';

describe('scripts in the project folder', () => {
  it('saves into AiWorldEd/Scripts, lists saved scripts by name and loads them back', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    root.put(`${SOLID_SCRIPT_PROJECT_DIRECTORY}/notes.txt`, 'not a script');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    const document = solidScriptDocumentCreate([{ command: 'cube', values: { size: '[1, 2, 3]' } }], 'Tall: Box');
    const fileName = await solidScriptProjectSave(fileSystem, document);
    expect(fileName).toBe('Tall- Box.aiscript');
    await solidScriptProjectSave(fileSystem, { ...document, name: 'Arch' });
    expect(await solidScriptProjectList(fileSystem)).toEqual(['Arch.aiscript', 'Tall- Box.aiscript']);
    const loaded = await solidScriptProjectLoad(fileSystem, 'Tall- Box.aiscript');
    expect(loaded).toEqual({ ...document, name: 'Tall- Box' });
  });

  it('reads a script anywhere in the project, naming an unnamed one after its file', async () => {
    const root = new ProjectMockDirectoryHandle('game');
    const fileSystem = new ProjectFileSystemHandle(root.asHandle());
    await fileSystem.fileWrite('Props/Lamp Post.aiscript', await solidScriptFileEncode(solidScriptDocumentCreate([])));
    expect((await solidScriptProjectRead(fileSystem, 'Props/Lamp Post.aiscript')).name).toBe('Lamp Post');
  });

  it('makes safe file names and rejects empty ones', () => {
    expect(solidScriptProjectFileName('  Door / Frame: v2 ')).toBe('Door - Frame- v2.aiscript');
    expect(solidScriptProjectFileName('Ramp.aiscript')).toBe('Ramp.aiscript');
    expect(() => solidScriptProjectFileName(' ./ ')).toThrow(/name/);
  });
});
