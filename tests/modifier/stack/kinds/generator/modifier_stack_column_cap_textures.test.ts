import { describe, expect, it } from 'vitest';
import { curvePresetBuild } from '@/curve/model/curve_preset.js';
import { curveEncode } from '@/curve/model/curve_codec.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { MODIFIER_STACK_CAP_FLAT_NORMAL } from '@/modifier/stack/kinds/generator/modifier_stack_generator_cap_textures.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Encodes a preset profile by id.
 *
 * @param id Preset id.
 * @returns Encoded profile.
 */
function presetProfile(id: string): string {
  const preset = CURVE_PRESETS_EXTENDED.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Missing preset ${id}`);
  return curveEncode(curvePresetBuild(preset));
}

/**
 * Compiles a column and returns its generated pieces.
 *
 * @param parameters Column parameters.
 * @returns Generated brushes.
 */
function columnPieces(parameters: Record<string, unknown>): SolidBrushInstance[] {
  return stackFixture([{ kind: 'column', parameters }], 2)
    .compile()
    .instances.slice(1);
}

/**
 * Lists every face with its vertical normal component and texture.
 *
 * @param pieces Generated brushes.
 * @returns Faces in piece order.
 */
function faceTextures(pieces: readonly SolidBrushInstance[]): { up: number; texture: string }[] {
  return pieces.flatMap((piece) =>
    piece.brush.faces.map((face, index) => ({
      up: piece.brush.planes[index]?.normal.y ?? 0,
      texture: piece.getSurfaceTextureId(face.surfaceIndex),
    })),
  );
}

/**
 * Returns the expected texture of a face from its normal.
 *
 * @param up Vertical normal component.
 * @returns Top, bottom or side texture id.
 */
function expectedTexture(up: number): string {
  if (up >= MODIFIER_STACK_CAP_FLAT_NORMAL) return 'top-stone';
  return up <= -MODIFIER_STACK_CAP_FLAT_NORMAL ? 'bottom-stone' : 'side-stone';
}

/** Optional separate textures for flat top and bottom column faces. */
describe('column top and bottom face textures', () => {
  const textures = { texture: 'side-stone', textureTop: 'top-stone', textureBottom: 'bottom-stone' };

  it.each(['stone_cairn', 'solomonic_column', 'turning_tower', 'diagonal_pinnacle'])(
    'gives flat faces of %s their own textures by normal',
    (id) => {
      const faces = faceTextures(
        columnPieces({ profile: presetProfile(id), aspect: 1.3, capTextures: true, ...textures }),
      );
      for (const face of faces) expect(face.texture).toBe(expectedTexture(face.up));
      expect(faces.filter((face) => face.texture === 'top-stone').length).toBeGreaterThan(1);
      expect(faces.filter((face) => face.texture === 'bottom-stone').length).toBeGreaterThan(1);
      expect(faces.some((face) => face.texture === 'side-stone')).toBe(true);
    },
  );

  it('uses the main texture everywhere while switched off, exactly as without the settings', () => {
    const profile = presetProfile('stone_cairn');
    const plain = columnPieces({ profile, texture: 'side-stone' });
    const off = columnPieces({ profile, ...textures, capTextures: false });
    expect(faceTextures(off).every((face) => face.texture === 'side-stone')).toBe(true);
    expect(off.map((piece) => piece.brush.vertices.map((vertex) => vertex.toArray()))).toEqual(
      plain.map((piece) => piece.brush.vertices.map((vertex) => vertex.toArray())),
    );
    expect(faceTextures(off)).toEqual(faceTextures(plain));
  });

  it('keeps the main texture on flat faces whose own texture is Default', () => {
    const faces = faceTextures(
      columnPieces({
        profile: presetProfile('stone_cairn'),
        texture: 'side-stone',
        textureTop: 'top-stone',
        capTextures: true,
      }),
    );
    for (const face of faces)
      expect(face.texture).toBe(face.up >= MODIFIER_STACK_CAP_FLAT_NORMAL ? 'top-stone' : 'side-stone');
  });

  it('writes no new settings until used and remembers textures while switched off', () => {
    const column = modifierStackKindFind('column');
    if (!column) throw new Error('Expected the column kind');
    const fresh = column.normalizeParameters(column.createParameters());
    for (const key of ['capTextures', 'textureTop', 'textureBottom']) expect(key in fresh).toBe(false);
    const remembered = column.normalizeParameters({ ...fresh, capTextures: false, textureTop: 'top-stone' });
    expect(remembered).toEqual({ ...fresh, textureTop: 'top-stone' });
    const volume = ModifierVolume.create({
      modifiers: [
        {
          id: 'm1',
          kind: 'column',
          name: 'Column',
          enabled: true,
          expanded: true,
          parameters: { ...fresh, capTextures: true, textureBottom: 'bottom-stone' },
        },
      ],
    });
    const stored = JSON.parse(JSON.stringify(ModifierVolume.read(volume)));
    expect(stored.modifiers[0].parameters).toMatchObject({ capTextures: true, textureBottom: 'bottom-stone' });
    expect(ModifierVolume.read(ModifierVolume.create(stored)).modifiers[0]?.parameters).toEqual(
      stored.modifiers[0].parameters,
    );
  });

  it('shows the top and bottom texture rows only while the toggle is on', () => {
    const column = modifierStackKindFind('column');
    if (!column) throw new Error('Expected the column kind');
    const committed: unknown[] = [];
    const rows = new ModifierStackFieldRows(
      column.fields,
      (key, value) => committed.push([key, value]),
      () => [],
    );
    const hidden = (label: string): boolean => {
      const caption = [...rows.getElement().querySelectorAll('span')].find((element) => element.textContent === label);
      if (!caption) throw new Error(`Missing row ${label}`);
      for (let element: HTMLElement | null = caption; element; element = element.parentElement)
        if (element.style.display === 'none') return true;
      return false;
    };
    const parameters = column.normalizeParameters(column.createParameters());
    rows.update(parameters);
    const toggle = rows.getElement().querySelector<HTMLInputElement>('input[aria-label="Cap textures"]');
    expect(toggle?.checked).toBe(false);
    expect(hidden('Top faces')).toBe(true);
    expect(hidden('Bottom faces')).toBe(true);
    if (!toggle) throw new Error('Expected the toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(committed).toEqual([['capTextures', true]]);
    rows.update({ ...parameters, capTextures: true });
    expect(hidden('Top faces')).toBe(false);
    expect(hidden('Bottom faces')).toBe(false);
  });
});

/**
 * Stairs and arch reuse Column's optional flat-cap texture mapping and
 * controls.
 */
describe.each(['stairs', 'arch'])('%s top and bottom face textures', (kind) => {
  const textures = { texture: 'side-stone', textureTop: 'top-stone', textureBottom: 'bottom-stone' };
  it('maps only horizontal caps and leaves side faces on the main texture', () => {
    const pieces = stackFixture([{ kind, parameters: { style: 'wall', ...textures, capTextures: true } }], 2)
      .compile()
      .instances.slice(1);
    const faces = faceTextures(pieces);
    expect(faces.some((face) => face.texture === 'top-stone')).toBe(true);
    expect(faces.some((face) => face.texture === 'bottom-stone')).toBe(true);
    expect(faces.some((face) => face.texture === 'side-stone')).toBe(true);
    for (const face of faces) expect(face.texture).toBe(expectedTexture(face.up));
    const off = stackFixture([{ kind, parameters: { style: 'wall', ...textures, capTextures: false } }], 2)
      .compile()
      .instances.slice(1);
    expect(faceTextures(off).every((face) => face.texture === 'side-stone')).toBe(true);
  });
  it('omits unused defaults and hides the pickers until enabled', () => {
    const generator = modifierStackKindFind(kind);
    if (!generator) throw new Error('Missing generator');
    const parameters = generator.normalizeParameters(generator.createParameters());
    for (const key of ['capTextures', 'textureTop', 'textureBottom']) expect(key in parameters).toBe(false);
    const fields = generator.fields.filter((field) => ['textureTop', 'textureBottom'].includes(field.key));
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.visible?.(parameters)).toBe(false);
      expect(field.visible?.({ ...parameters, capTextures: true })).toBe(true);
    }
    const remembered = generator.normalizeParameters({ ...parameters, capTextures: false, textureTop: 'top-stone' });
    expect(remembered['textureTop']).toBe('top-stone');
  });
});
