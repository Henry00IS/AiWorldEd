import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectDesktopHost } from '@/project/desktop/project_desktop_host.js';
import { createProjectDesktopBridge } from '@/project/desktop/project_desktop_protocol.js';
import {
  ProjectFileSystemDesktop,
  projectDesktopBase64Decode,
  projectDesktopBase64Encode,
} from '@/project/desktop/project_file_system_desktop.js';
import { ProjectScanner } from '@/project/scan/project_scanner.js';

let base = '';

/**
 * Builds a host whose dialog returns the project folder.
 *
 * @returns Host and project folder.
 */
async function hostCreate() {
  const project = join(base, 'game');
  await mkdir(join(project, 'textures'), { recursive: true });
  await writeFile(join(project, 'textures', 'a.png'), 'png');
  const host = new ProjectDesktopHost(join(base, 'state', 'roots.json'), async () => project);
  return { host, project };
}

describe('ProjectDesktopHost', () => {
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'aiworlded-host-'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('lists, reads, writes and removes inside a picked folder', async () => {
    const { host } = await hostCreate();
    const picked = await host.pick();
    expect(picked?.name).toBe('game');
    const root = picked?.root as string;
    const listed = await host.list({ root, path: 'textures', extensions: ['png'] });
    expect(listed).toEqual([expect.objectContaining({ name: 'a.png', kind: 'file', size: 3 })]);
    const read = await host.read({ root, path: 'textures/a.png' });
    expect(Buffer.from(read.base64, 'base64').toString()).toBe('png');
    await host.write({ root, path: '.aiworlded/autosave/s.json', base64: Buffer.from('{}').toString('base64') });
    expect(await readFile(join(root, '.aiworlded/autosave/s.json'), 'utf8')).toBe('{}');
    await host.remove({ root, path: '.aiworlded/autosave/s.json' });
    expect(await host.list({ root, path: '.aiworlded/autosave', extensions: [] })).toEqual([]);
  });

  it('remembers the last folder across restarts', async () => {
    const { host } = await hostCreate();
    const picked = await host.pick();
    const again = new ProjectDesktopHost(join(base, 'state', 'roots.json'), async () => null);
    expect(await again.last()).toEqual(picked);
    expect(await again.pick()).toBeNull();
  });

  it('refuses folders the user did not pick and paths that escape', async () => {
    const { host, project } = await hostCreate();
    await expect(host.read({ root: base, path: 'game/textures/a.png' })).rejects.toThrow('not picked');
    const picked = await host.pick();
    const root = picked?.root as string;
    await expect(host.read({ root, path: '../state/roots.json' })).rejects.toThrow();
    await writeFile(join(base, 'secret.txt'), 'secret');
    await symlink(join(base, 'secret.txt'), join(project, 'link.png'));
    await expect(host.read({ root, path: 'link.png' })).rejects.toThrow('leaves');
    expect(await host.list({ root, path: '', extensions: ['png'] })).not.toContainEqual(
      expect.objectContaining({ name: 'link.png' }),
    );
  });

  it('backs a project file system the scanner can walk', async () => {
    const { host } = await hostCreate();
    const bridge = createProjectDesktopBridge({
      request: {
        projectPick: () => host.pick(),
        projectLast: () => host.last(),
        projectList: (params) => host.list(params),
        projectRead: (params) => host.read(params),
        projectWrite: (params) => host.write(params),
        projectRemove: (params) => host.remove(params),
      },
    });
    const picked = await bridge.pick();
    const fileSystem = new ProjectFileSystemDesktop(bridge, picked as NonNullable<typeof picked>);
    const snapshot = await new ProjectScanner().scan(fileSystem);
    expect([...snapshot.files.keys()]).toEqual(['textures/a.png']);
    await fileSystem.fileWrite('notes/x.json', '{"a":1}');
    expect(await (await fileSystem.fileRead('notes/x.json')).text()).toBe('{"a":1}');
  });

  it('round-trips base64 for large buffers', () => {
    const bytes = new Uint8Array(200_000).map((_, index) => index % 251);
    expect(projectDesktopBase64Decode(projectDesktopBase64Encode(bytes))).toEqual(bytes);
  });
});
