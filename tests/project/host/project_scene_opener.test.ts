import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_SCENE_OPENER_OFFERED_KEY, ProjectSceneOpener } from '@/project/host/project_scene_opener.js';
import {
  ProjectHostMemoryStorage,
  projectHostAutosaveCreate,
  projectHostAutosavePut,
  projectHostControllerCreate,
  projectHostFakeCreate,
  projectHostFolderCreate,
} from './project_host_test_utils.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';

const FUTURE = 9_000_000_000_000;

/**
 * Builds an opener over an opened mock project.
 *
 * @param answers Confirm answers.
 * @returns Fixture parts.
 */
async function openerCreate(answers: boolean[] = []) {
  const fake = projectHostFakeCreate(answers);
  const { root, picker } = projectHostFolderCreate();
  const { project } = projectHostControllerCreate(fake.library, picker);
  await project.open();
  const autosave = projectHostAutosaveCreate(project);
  const changed = vi.spyOn(autosave, 'savedMarkSet');
  const storage = new ProjectHostMemoryStorage();
  const opener = new ProjectSceneOpener(fake.host, project, autosave, storage);
  const record = (path: string) => project.snapshot().files.get(path)!;
  return { ...fake, root, project, autosave, changed, storage, opener, record };
}

describe('ProjectSceneOpener', () => {
  afterEach(() => document.body.replaceChildren());

  it('loads a scene and reports its project path while loading', async () => {
    const fixture = await openerCreate();
    let seen: string | null = null;
    fixture.host.sceneLoad.mockImplementation(() => ((seen = fixture.opener.loadingPath()), true));
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(expect.any(Blob), 'start.json');
    expect(await ((fixture.host.sceneLoad.mock.calls[0] as unknown[])[0] as Blob).text()).toContain('"A"');
    expect(seen).toBe('maps/start.json');
    expect(fixture.opener.loadingPath()).toBeNull();
    fixture.project.dispose();
  });

  it('makes a snapshot when a level opens, but not when a save is restored or a model imported', async () => {
    const fixture = await openerCreate([true]);
    const snapshot = vi.spyOn(fixture.autosave, 'snapshot');
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(snapshot).toHaveBeenCalledTimes(1);
    await fixture.opener.open(fixture.record('models/crate.obj'));
    await projectHostAutosavePut(fixture.project.fileSystem()!, 'maps/start.json', FUTURE);
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.sceneLoad).toHaveBeenLastCalledWith(expect.any(Blob), 'maps/start.json (saved state)');
    expect(snapshot).toHaveBeenCalledTimes(1);
    fixture.host.sceneLoad.mockReturnValue(false);
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(snapshot).toHaveBeenCalledTimes(1);
    fixture.project.dispose();
  });

  it('imports VMF and OBJ files', async () => {
    const fixture = await openerCreate();
    await fixture.opener.open(fixture.record('maps/de_dust.vmf'));
    await fixture.opener.open(fixture.record('models/crate.obj'));
    expect(fixture.host.vmfImport).toHaveBeenCalledWith('versioninfo {}', 'de_dust.vmf', 'view');
    expect(fixture.host.objImport).toHaveBeenCalledWith('v 0 0 0', 'crate.obj', 'view');
    await fixture.opener.open(fixture.record('models/crate.obj'), 'original');
    expect(fixture.host.objImport).toHaveBeenLastCalledWith('v 0 0 0', 'crate.obj', 'original');
    fixture.project.dispose();
  });

  it('imports GLB files as bytes with their project path', async () => {
    const fixture = await openerCreate();
    fixture.root.put('models/door.glb', new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]));
    await fixture.project.refresh();
    await fixture.opener.open(fixture.record('models/door.glb'));
    const [bytes, name, path, placement] = vi.mocked(fixture.host.glbImport).mock.calls[0] ?? [];
    expect(bytes?.byteLength).toBe(8);
    expect([name, path, placement]).toEqual(['door.glb', 'models/door.glb', 'view']);
    fixture.project.dispose();
  });

  it('imports FBX files as bytes with their project path', async () => {
    const fixture = await openerCreate();
    fixture.root.put('models/crate.fbx', new TextEncoder().encode('; FBX 7.4.0 project file\n'));
    await fixture.project.refresh();
    await fixture.opener.open(fixture.record('models/crate.fbx'));
    const [bytes, name, path, placement] = vi.mocked(fixture.host.fbxImport).mock.calls[0] ?? [];
    expect(bytes?.byteLength).toBe(25);
    expect([name, path, placement]).toEqual(['crate.fbx', 'models/crate.fbx', 'view']);
    fixture.project.dispose();
  });

  it('refuses while blocked and asks before dropping unsaved work', async () => {
    const fixture = await openerCreate([false]);
    fixture.state.blocked = true;
    await fixture.opener.open(fixture.record('maps/start.json'));
    fixture.state.blocked = false;
    fixture.state.unsaved = true;
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.confirm).toHaveBeenCalledWith('Open Scene', expect.any(String), 'Open', 'Cancel');
    expect(fixture.host.sceneLoad).not.toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('offers a newer autosave when opening its scene', async () => {
    const fixture = await openerCreate([true]);
    await projectHostAutosavePut(fixture.root, 'maps/start.json', FUTURE);
    await fixture.opener.open(fixture.record('maps/start.json'));
    expect(fixture.host.confirm).toHaveBeenCalledWith(
      'Recover Autosave',
      expect.any(String),
      'Open Autosave',
      'Open File',
    );
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(expect.any(Blob), 'maps/start.json (saved state)');
    expect(await ((fixture.host.sceneLoad.mock.calls.at(-1) as unknown[])[0] as Blob).text()).toContain('Recovered');
    expect(fixture.changed).toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('opens the file when the autosave is declined or older', async () => {
    const declined = await openerCreate([false]);
    await projectHostAutosavePut(declined.root, 'maps/start.json', FUTURE);
    await declined.opener.open(declined.record('maps/start.json'));
    expect(declined.host.confirm).toHaveBeenCalledTimes(1);
    expect(declined.host.sceneLoad).toHaveBeenLastCalledWith(expect.any(Blob), 'start.json');
    declined.project.dispose();
    const older = await openerCreate([]);
    await projectHostAutosavePut(older.root, 'maps/start.json', 1);
    await older.opener.open(older.record('maps/start.json'));
    expect(older.host.confirm).not.toHaveBeenCalled();
    expect(older.host.sceneLoad).toHaveBeenLastCalledWith(expect.any(Blob), 'start.json');
    expect(await ((older.host.sceneLoad.mock.calls.at(-1) as unknown[])[0] as Blob).text()).toContain('"A"');
    older.project.dispose();
  });

  it('offers the newest autosave once after the project opens', async () => {
    const fixture = await openerCreate([true]);
    await projectHostAutosavePut(fixture.root, null, FUTURE);
    const fileSystem = fixture.project.fileSystem()!;
    await fixture.opener.recoveryOffer(fileSystem);
    await fixture.opener.recoveryOffer(fileSystem);
    expect(fixture.host.confirm).toHaveBeenCalledTimes(1);
    expect(fixture.host.sceneLoad).toHaveBeenCalledWith(expect.any(Blob), 'untitled (saved state)');
    expect(fixture.storage.getItem(PROJECT_SCENE_OPENER_OFFERED_KEY)).toBe(String(FUTURE));
    fixture.project.dispose();
  });

  it('lists the embedded textures of a restored autosave from the texture cache before loading it', async () => {
    const fixture = await openerCreate([true]);
    const png = pngHeaderCreate(8, 8);
    const hash = sha256HexSync(png);
    const id = `embedded:${hash}.png`;
    await projectHostAutosavePut(fixture.root, null, FUTURE, {
      version: 1,
      objects: [{ name: 'Crate', textureId: id }],
    });
    fixture.root.put(`AiWorldEd/.Local/TextureCache/${hash}.png`, png);
    fixture.root.put(`AiWorldEd/.Local/TextureCache/${hash}.json`, '{"name":"crate"}');
    let listed: string | undefined;
    fixture.host.sceneLoad.mockImplementation(() => {
      listed = fixture.library.getEntryById(id)?.displayName;
      return true;
    });
    await fixture.opener.recoveryOffer(fixture.project.fileSystem()!);
    expect(listed).toBe('crate');
    fixture.project.dispose();
  });

  it('does not offer recovery over unsaved work', async () => {
    const fixture = await openerCreate([true]);
    await projectHostAutosavePut(fixture.root, null, FUTURE);
    fixture.state.unsaved = true;
    await fixture.opener.recoveryOffer(fixture.project.fileSystem()!);
    expect(fixture.host.confirm).not.toHaveBeenCalled();
    fixture.project.dispose();
  });

  it('reports files it cannot read', async () => {
    const fixture = await openerCreate();
    const record = fixture.record('maps/start.json');
    fixture.root.delete('maps/start.json');
    await fixture.opener.open(record);
    expect(fixture.host.status).toHaveBeenCalledWith(expect.stringContaining('Could not read maps/start.json'));
    fixture.project.dispose();
  });
});
