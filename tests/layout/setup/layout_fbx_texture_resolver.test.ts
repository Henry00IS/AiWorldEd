import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutFbxTextureResolver } from '@/layout/setup/layout_fbx_texture_resolver.js';
import { LAYOUT_ROOM_TEXTURE_NOTE } from '@/layout/setup/layout_glb_texture_resolver.js';
import type { FbxImportTexture } from '@/io/fbx/import/fbx_import_types.js';
import type { ControllerProjectEditor } from '@/project/host/controller_project_editor.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { showMessageBox } from '@/ui/dialog/dialog_message_box.js';
import { textureSourceGateSet } from '@/texture/library/texture_source_gate.js';
import { sha256HexSync } from '@/utils/utils_sha256.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';
import { PROJECT_MOCK_PNG } from '../../project/fs/project_mock_directory_handle.js';
import {
  projectHostControllerCreate,
  projectHostFakeCreate,
  projectHostFolderCreate,
} from '../../project/host/project_host_test_utils.js';

vi.mock('@/ui/dialog/dialog_message_box.js', () => ({ showMessageBox: vi.fn(async () => false) }));

/**
 * A texture file next to the project's textures, one missing file and one
 * embedded image.
 */
const TEXTURES: FbxImportTexture[] = [
  { index: 0, name: 'brick', references: ['..\\textures\\brick.png', 'C:\\art\\brick.png'], image: null },
  { index: 1, name: 'glass', references: ['glass.png'], image: null },
  {
    index: 2,
    name: 'sign',
    references: ['house.fbm/sign.png'],
    image: { index: 2, name: 'sign', mimeType: 'image/png', bytes: pngHeaderCreate(8, 8) },
  },
];

/**
 * Creates a resolver over the mock project folder.
 *
 * @param open Open the project first.
 * @returns Resolver and project.
 */
async function resolverCreate(open: boolean) {
  const fake = projectHostFakeCreate();
  const { picker } = projectHostFolderCreate();
  const { project } = projectHostControllerCreate(fake.library, picker);
  if (open) await project.open();
  const editor = { project, openOrReopen: vi.fn(async () => false) } as unknown as ControllerProjectEditor;
  const parts = { projectEditor: () => editor, library: (): TextureLibrary => fake.library };
  return { resolver: new LayoutFbxTextureResolver(parts, 'models'), project };
}

describe('LayoutFbxTextureResolver', () => {
  afterEach(() => {
    vi.mocked(showMessageBox).mockClear();
    textureSourceGateSet(null);
  });

  it("keeps room members' textures as references by the hash of what they can read, else by name, storing nothing", async () => {
    const { resolver, project } = await resolverCreate(true);
    textureSourceGateSet(() => 'member');
    const resolution = await resolver.resolve(TEXTURES);
    expect([...resolution.textureIdByImage].sort()).toEqual([
      [0, `embedded:${sha256HexSync(PROJECT_MOCK_PNG)}.png`],
      [1, 'glass.png'],
      [2, `embedded:${sha256HexSync(pngHeaderCreate(8, 8))}.png`],
    ]);
    expect(resolution.note).toBe(`${LAYOUT_ROOM_TEXTURE_NOTE} brick.png, glass.png, sign.png`);
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(project.snapshot().files.has(`embedded:${sha256HexSync(pngHeaderCreate(8, 8))}.png`)).toBe(false);
  });

  it("keeps a room member's external textures by file name without an open project folder", async () => {
    const { resolver } = await resolverCreate(false);
    textureSourceGateSet(() => 'member');
    const resolution = await resolver.resolve(TEXTURES.slice(0, 2));
    expect([...resolution.textureIdByImage].sort()).toEqual([
      [0, 'brick.png'],
      [1, 'glass.png'],
    ]);
  });

  it('links project files, embeds embedded images and names missing files', async () => {
    const { resolver, project } = await resolverCreate(true);
    const resolution = await resolver.resolve(TEXTURES);
    expect([...resolution.textureIdByImage].sort()).toEqual([
      [0, 'textures/brick.png'],
      [2, `embedded:${sha256HexSync(pngHeaderCreate(8, 8))}.png`],
    ]);
    expect(resolution.note).toBe(
      'embedded 1 new texture in the level; linked 1 texture from the project, 1 texture file not found in the project (glass.png)',
    );
    project.dispose();
  });

  it('keeps file textures on the checker without an open project', async () => {
    const { resolver } = await resolverCreate(false);
    const resolution = await resolver.resolve(TEXTURES.slice(0, 2));
    expect(resolution.textureIdByImage.size).toBe(0);
    expect(resolution.note).toBe(
      '2 texture files kept on the checker: open the project folder holding them (brick.png, glass.png)',
    );
    expect(showMessageBox).not.toHaveBeenCalled();
  });
});
