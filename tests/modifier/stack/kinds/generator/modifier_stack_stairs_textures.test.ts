import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackParameterSet } from '@/modifier/stack/modifier_stack_operations.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierStackStairsFaceRole } from '@/modifier/stack/kinds/generator/modifier_stack_stairs_textures.js';
import { getFaceTextureMapsLive } from '@/texture/uv/face_texture_storage.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/** Role textures used by every test. */
const ROLE_TEXTURES = {
  texture: 'riser',
  capTextures: true,
  textureTop: 'tread',
  textureSide: 'wall',
  textureBottom: 'under',
};

/** Texture each role should carry. */
const ROLE_TEXTURE: Record<string, string> = { top: 'tread', side: 'wall', bottom: 'under', main: 'riser' };

/**
 * Returns the role of a world-space normal of a flight climbing along Z.
 *
 * @param normal Unit normal.
 * @returns Expected texture.
 */
function expectedTexture(normal: THREE.Vector3): string {
  return ROLE_TEXTURE[modifierStackStairsFaceRole(normal, 'x')] ?? '';
}

/**
 * Lists every face of the pieces as normal and texture.
 *
 * @param pieces Generated brushes.
 * @returns Faces.
 */
function faces(pieces: readonly SolidBrushInstance[]): { normal: THREE.Vector3; texture: string }[] {
  return pieces.flatMap((piece) =>
    piece.brush.faces.map((face, index) => ({
      normal: piece.brush.planes[index]?.normal.clone() ?? new THREE.Vector3(),
      texture: piece.getSurfaceTextureId(face.surfaceIndex),
    })),
  );
}

/**
 * Checks every triangle of a solid's result mesh against its role texture.
 *
 * @param model Solid model.
 * @returns Number of triangles with the wrong texture, and the triangle count.
 */
function resultMismatches(model: SolidModel): { wrong: number; triangles: number } {
  const mesh = model.getResultMesh();
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const textures = new Map<number, string>();
  for (const entry of getFaceTextureMapsLive(mesh))
    for (const triangle of entry.triangleIndices) textures.set(triangle, entry.mapping.textureId);
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
  const triangles = (index ? index.count : position.count) / 3;
  let wrong = 0;
  for (let triangle = 0; triangle < triangles; triangle++) {
    corners.forEach((corner, k) =>
      corner.fromBufferAttribute(position, index ? index.getX(triangle * 3 + k) : triangle * 3 + k),
    );
    const normal = new THREE.Vector3()
      .subVectors(corners[1], corners[0])
      .cross(new THREE.Vector3().subVectors(corners[2], corners[0]))
      .normalize();
    if (textures.get(triangle) !== expectedTexture(normal)) wrong++;
  }
  return { wrong, triangles };
}

describe('stairs face textures', () => {
  it.each(['slab', 'solid', 'floating'])('textures treads, side walls, underside and risers by role (%s)', (fill) => {
    const pieces = stackFixture([{ kind: 'stairs', parameters: { fill, landing: 0.5, ...ROLE_TEXTURES } }], 2)
      .compile()
      .instances.slice(1);
    const list = faces(pieces);
    for (const face of list) expect(face.texture).toBe(expectedTexture(face.normal));
    for (const texture of Object.values(ROLE_TEXTURE)) expect(list.some((face) => face.texture === texture)).toBe(true);
  });

  it('gives the sloped slab underside the bottom texture', () => {
    const pieces = stackFixture([{ kind: 'stairs', parameters: { fill: 'slab', ...ROLE_TEXTURES } }], 2)
      .compile()
      .instances.slice(1);
    const sloped = faces(pieces).filter((face) => face.normal.y < -1e-6 && Math.abs(face.normal.z) > 1e-6);
    expect(sloped.length).toBeGreaterThan(0);
    for (const face of sloped) expect(face.texture).toBe('under');
  });

  it('names the side walls across the flight for every climb direction', () => {
    for (const direction of ['+x', '-x', '+z', '-z']) {
      const pieces = stackFixture([{ kind: 'stairs', parameters: { direction, ...ROLE_TEXTURES } }], 2)
        .compile()
        .instances.slice(1);
      const across = direction.endsWith('x') ? 'z' : 'x';
      for (const face of faces(pieces))
        if (Math.abs(face.normal[across]) > 0.5) expect(face.texture).toBe('wall');
        else if (Math.abs(face.normal[direction.endsWith('x') ? 'x' : 'z']) > 0.999) expect(face.texture).toBe('riser');
    }
  });

  it('uses the main texture everywhere while switched off', () => {
    const pieces = stackFixture([{ kind: 'stairs', parameters: { ...ROLE_TEXTURES, capTextures: false } }], 2)
      .compile()
      .instances.slice(1);
    expect(faces(pieces).every((face) => face.texture === 'riser')).toBe(true);
  });

  it('omits unused settings and shows the pickers only while switched on', () => {
    const stairs = modifierStackKindFind('stairs');
    if (!stairs) throw new Error('Missing stairs');
    const parameters = stairs.normalizeParameters(stairs.createParameters());
    const keys = ['capTextures', 'textureTop', 'textureSide', 'textureBottom'];
    for (const key of keys) expect(key in parameters).toBe(false);
    const pickers = stairs.fields.filter((field) => keys.slice(1).includes(field.key));
    expect(pickers.map((field) => field.label)).toEqual(['Top', 'Sides', 'Bottom']);
    for (const field of pickers) {
      expect(field.visible?.(parameters)).toBe(false);
      expect(field.visible?.({ ...parameters, capTextures: true })).toBe(true);
    }
    expect(stairs.normalizeParameters({ ...parameters, capTextures: false, textureSide: 'wall' })).toEqual({
      ...parameters,
      textureSide: 'wall',
    });
  });
});

describe('stairs undo and redo', () => {
  it('rebuilds Landing and keeps role textures on both staircases through undo and redo', () => {
    const world = new THREE.Group();
    const model = new SolidModel('Stairs');
    world.add(model.root);
    const flights = [0, 1].map((offset) => {
      const node = modifierGeneratorNodeCreate('stairs');
      node.scale.set(2, 3, 6);
      node.position.set(offset * 3, 1.5, 0);
      const settings = ModifierVolume.read(node);
      const entry = settings.modifiers[0];
      if (!entry) throw new Error('Missing stairs step');
      entry.parameters = { ...entry.parameters, sizing: 'count', count: 8, ...ROLE_TEXTURES };
      ModifierVolume.write(node, settings);
      model.root.add(node);
      return node;
    });
    modifierBevelRefreshScene(world);
    const shape = (): string => Array.from(model.getResultMesh().geometry.getAttribute('position').array).join(',');
    const flat = shape();
    expect(resultMismatches(model).wrong).toBe(0);
    const second = flights[1];
    if (!second) throw new Error('Missing flight');
    const before = ModifierVolume.read(second);
    const after = modifierStackParameterSet(before, before.modifiers[0]?.id ?? '', 'landing', 2);
    const command = new CommandModifierStackSet(second, before, after);
    command.execute();
    const landed = shape();
    expect(landed).not.toBe(flat);
    for (const step of ['undo', 'redo', 'undo', 'redo'] as const) {
      if (step === 'undo') command.undo();
      else command.execute();
      expect(shape()).toBe(step === 'undo' ? flat : landed);
      const check = resultMismatches(model);
      expect(check.triangles).toBeGreaterThan(0);
      expect(check.wrong).toBe(0);
    }
  });
});
