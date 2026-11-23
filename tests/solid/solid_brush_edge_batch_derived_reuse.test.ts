import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolidBrushEdgeBatch, SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/** Edge bakes of derived brushes, counted through the private bake step. */
const bakes = vi.spyOn(
  SolidBrushEdgeBatch as unknown as { extractLocalEdgePositions: (geometry: THREE.BufferGeometry) => unknown },
  'extractLocalEdgePositions',
);

/**
 * Builds a SolidScript generator in a level whose script can be rewritten.
 *
 * @returns Rewrites the script with cube sizes and a message, and rebuilds.
 */
function fixture() {
  const world = new THREE.Group();
  const model = new SolidModel('edges');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  const write = (sizes: number[], message: string): void => {
    const lines = [
      ...sizes.map((size) => ({ command: 'cube', values: { size: `${size}` } })),
      { command: 'echo', values: { text: message } },
    ] as SolidScriptLine[];
    modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate(lines, 'Cubes') }, null);
    world.updateMatrixWorld(true);
    model.markDirty();
    model.rebuild(true);
  };
  return { model, write };
}

/**
 * Lists every batch vertex of a solid in order.
 *
 * @param solidRoot Solid model root.
 * @returns Coordinates.
 */
function batchVertices(solidRoot: THREE.Object3D): number[] {
  return solidRoot.children
    .filter(
      (child) => child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
    )
    .flatMap((child) => [...((child as THREE.LineSegments).geometry.getAttribute('position')?.array ?? [])]);
}

afterEach(() => bakes.mockClear());

describe('SolidBrushEdgeBatch edges of rebuilt generator brushes', () => {
  it('reuses the edges of brushes whose shape did not change', () => {
    const { model, write } = fixture();
    write([1, 2], 'a');
    const before = batchVertices(model.root);
    expect(before.length).toBeGreaterThan(0);
    bakes.mockClear();
    write([1, 2], 'b');
    expect(bakes).not.toHaveBeenCalled();
    expect(batchVertices(model.root)).toEqual(before);
  });

  it('bakes again only the brushes whose shape changed', () => {
    const { model, write } = fixture();
    write([1, 2], 'a');
    bakes.mockClear();
    write([1, 3], 'a');
    expect(bakes).toHaveBeenCalledTimes(1);
    const fresh = fixture();
    fresh.write([1, 3], 'a');
    expect(batchVertices(model.root)).toEqual(batchVertices(fresh.model.root));
  });
});
