import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackCacheOf } from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import { modifierStackKindFind, modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import type { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';

/**
 * Builds a world with a moved solid holding one box brush and a turned
 * generator node of the given kind.
 *
 * @param kind Generator kind id.
 * @param parameters Generator parameter overrides.
 * @returns Fixture parts and helpers.
 */
function followFixture(kind: string, parameters: Record<string, unknown> = {}) {
  const world = new THREE.Group();
  const model = new SolidModel('Follow test');
  world.add(model.root);
  model.root.position.set(1, 2, 3);
  model.root.rotation.set(0, 0.4, 0);
  model.addBoxBrush(1, SolidOperation.Additive);
  const node = modifierGeneratorNodeCreate(kind);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first!, parameters: { ...first!.parameters, ...parameters } }, ...rest],
  });
  node.position.set(0.3, 0.2, -0.1);
  node.rotation.set(0.1, 0.2, 0.3);
  model.root.add(node);
  const pieces = (): SolidBrushInstance[] => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root).instances.filter((brush) =>
      brush.id.startsWith(`${node.uuid}#`),
    );
  };
  const fresh = (): SolidBrushInstance[] => {
    modifierStackCacheOf(model.root).clear();
    return pieces();
  };
  return { world, model, node, pieces, fresh };
}

/**
 * Counts how often a kind builds its pieces.
 *
 * @param kind Generator kind id.
 * @returns Spy on the kind's piece builder.
 */
function buildSpy(kind: string) {
  const instance = modifierStackKindFind(kind) as unknown as { buildPieces: (...args: unknown[]) => unknown };
  return vi.spyOn(instance, 'buildPieces');
}

/**
 * Describes pieces for comparison: id, operation, rounded vertices, and the
 * texture coordinates every face gives its own corners.
 *
 * @param pieces Generated pieces.
 * @returns Comparable rows.
 */
function piecesDescribe(pieces: readonly SolidBrushInstance[]): unknown[] {
  const round = (value: number) => Math.round(value * 1e6) / 1e6 + 0;
  return pieces.map((piece) => ({
    id: piece.id,
    operation: piece.operation,
    vertices: piece.brush.vertices.map((vertex) => vertex.toArray().map(round)),
    uvs: piece.brush.faces.map((face, index) => {
      const surface = piece.getFaceSurface(index);
      const corners = piece.brush.getFaceVertexIndices(face).map((vertex) => piece.brush.vertices[vertex]!);
      return [surface.textureId, corners.map((corner) => Object.values(surface.uv.project(corner)).map(round))];
    }),
  }));
}

/**
 * Lists parameter variants that flip every choice and boolean of a kind once.
 *
 * @param kind Modifier kind.
 * @returns Parameter overrides, the first keeping every default.
 */
function kindVariants(kind: ModifierStackKind): Record<string, unknown>[] {
  const variants: Record<string, unknown>[] = [{}];
  for (const field of kind.fields) {
    if (field.type === 'choice') for (const choice of field.choices ?? []) variants.push({ [field.key]: choice.value });
    if (field.type === 'boolean') variants.push({ [field.key]: !field.default });
  }
  return variants;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generator nodes follow moves and turns', () => {
  it('carries Arch and Column pieces and textures along a move and turn without building again', () => {
    for (const kind of ['arch', 'column']) {
      const fixture = followFixture(kind);
      expect(fixture.pieces().length).toBeGreaterThan(0);
      const spy = buildSpy(kind);
      fixture.node.position.add(new THREE.Vector3(4.5, 1.25, -2));
      fixture.node.rotation.set(0.7, -1.1, 0.2);
      const moved = piecesDescribe(fixture.pieces());
      expect(spy).not.toHaveBeenCalled();
      expect(moved).toEqual(piecesDescribe(fixture.fresh()));
    }
  });

  it('carries Stairs along a move with world-aligned textures, and builds again when turned', () => {
    const fixture = followFixture('stairs');
    fixture.pieces();
    const spy = buildSpy('stairs');
    fixture.node.position.add(new THREE.Vector3(-3, 0.5, 2.25));
    const moved = piecesDescribe(fixture.pieces());
    expect(spy).not.toHaveBeenCalled();
    expect(moved).toEqual(piecesDescribe(fixture.fresh()));
    spy.mockClear();
    fixture.node.rotation.y += 0.5;
    const turned = piecesDescribe(fixture.pieces());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(turned).toEqual(piecesDescribe(fixture.fresh()));
  });

  it('builds again when the box is resized, and follows the resized box afterwards', () => {
    for (const kind of ['arch', 'column', 'stairs']) {
      const fixture = followFixture(kind);
      const before = piecesDescribe(fixture.pieces());
      const spy = buildSpy(kind);
      fixture.node.scale.multiplyScalar(1.5);
      const resized = piecesDescribe(fixture.pieces());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(resized).not.toEqual(before);
      expect(resized).toEqual(piecesDescribe(fixture.fresh()));
      spy.mockClear();
      fixture.node.position.x += 2;
      fixture.pieces();
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('follows when the containing solid moves, matching a fresh build', () => {
    const fixture = followFixture('arch');
    fixture.pieces();
    const spy = buildSpy('arch');
    fixture.model.root.position.set(-4, 1, 6);
    fixture.model.root.rotation.set(0, -0.8, 0);
    const moved = piecesDescribe(fixture.pieces());
    expect(spy).not.toHaveBeenCalled();
    expect(moved).toEqual(piecesDescribe(fixture.fresh()));
  });

  it('builds again when another modifier on the node does not declare that it follows', () => {
    const fixture = followFixture('column');
    const settings = ModifierVolume.read(fixture.node);
    const array = modifierStackKindFind('linear');
    if (!array) throw new Error('linear array kind missing');
    const entry = { ...settings.modifiers[0]!, id: 'array', kind: array.id, name: array.label };
    ModifierVolume.write(fixture.node, {
      ...settings,
      modifiers: [...settings.modifiers, { ...entry, parameters: array.normalizeParameters({}) }],
    });
    fixture.pieces();
    const spy = buildSpy('column');
    fixture.node.position.x += 1;
    fixture.pieces();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('every installed generator kind keeps its declared follow mode for every choice and toggle', () => {
    const generators = modifierStackKinds.filter((kind) => kind.category === 'generate');
    expect(generators.length).toBeGreaterThan(0);
    for (const kind of generators) {
      for (const variant of kindVariants(kind)) {
        const fixture = followFixture(kind.id, variant);
        fixture.pieces();
        fixture.node.position.add(new THREE.Vector3(2.5, -1, 3));
        if (kind.volumePoseFollow(kind.normalizeParameters(variant)) === 'rigid')
          fixture.node.rotation.set(-0.6, 1.3, 0.4);
        const followed = piecesDescribe(fixture.pieces());
        expect(followed, `${kind.id} ${JSON.stringify(variant)}`).toEqual(piecesDescribe(fixture.fresh()));
      }
    }
  });
});
