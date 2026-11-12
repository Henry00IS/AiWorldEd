import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import { markSolidBrushConvexityState, isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackStatusRead } from '@/modifier/stack/evaluate/modifier_stack_status.js';
import { modifierStackBrushGeometryValid } from '@/modifier/stack/evaluate/modifier_stack_validity.js';
import { MODIFIER_STACK_BEVEL_REJECTED } from '@/modifier/stack/kinds/bevel/modifier_stack_kind_bevel.js';
import type { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { stackFixture, stackResultBounds, type StackFixtureStep } from '../modifier_stack_fixture.js';

const LINEAR: StackFixtureStep = { kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 3 } };

/**
 * Returns the compiled result's vertex positions, rounded and sorted, so two
 * results can be compared regardless of brush order.
 *
 * @param model Solid model.
 * @returns Sorted position keys.
 */
function resultPositions(model: SolidModel): string[] {
  const position = model.getResultMesh().geometry.getAttribute('position');
  const keys: string[] = [];
  for (let index = 0; index < position.count; index++)
    keys.push([position.getX(index), position.getY(index), position.getZ(index)].map((v) => v.toFixed(4)).join(','));
  return keys.sort();
}

/**
 * Builds a linear-array fixture with a second brush placed beside the source.
 *
 * @returns Fixture and the extra brush.
 */
function fixtureWithNeighbour() {
  const fixture = stackFixture([LINEAR]);
  const neighbour = fixture.model.addBoxBrush(1, SolidOperation.Additive);
  neighbour.mesh?.position.set(0, 2, 0);
  return { ...fixture, neighbour };
}

/**
 * Marks a brush the way mesh editing does when it leaves the brush invalid.
 *
 * @param mesh Brush mesh.
 * @param valid New validity.
 */
function markValidity(mesh: THREE.Mesh | null, valid: boolean): void {
  if (!mesh) throw new Error('Expected a brush mesh');
  markSolidBrushConvexityState(mesh, valid);
}

/**
 * Wraps a modifier kind so its generated output is corrupted after it runs.
 *
 * @param id Kind id.
 * @param corrupt Change applied to the generated brushes.
 */
function corruptKind(id: string, corrupt: (brushes: THREE.Vector3[][]) => void): void {
  const kind = modifierStackKindFind(id) as ModifierStackKind;
  const apply = kind.apply.bind(kind);
  vi.spyOn(kind, 'apply').mockImplementation((units, context) => {
    const result = apply(units, context);
    corrupt(result.filter((unit) => !unit.authored).flatMap((unit) => unit.brushes.map((b) => b.brush.vertices)));
    return result;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('modifier stack brush validity', () => {
  it('rejects non-finite, degenerate and valid-looking broken brushes', () => {
    const fixture = stackFixture([]);
    const brush = fixture.source.brush;
    expect(modifierStackBrushGeometryValid(brush)).toBe(true);
    const flat = brush.clone();
    flat.transformVertices(new THREE.Matrix4().makeScale(0, 1, 1));
    expect(modifierStackBrushGeometryValid(flat)).toBe(false);
    const broken = brush.clone();
    broken.vertices[0]?.set(Number.NaN, 0, 0);
    expect(modifierStackBrushGeometryValid(broken)).toBe(false);
  });

  it('never captures an invalid source, so it has no copies and the result matches a volume without it', () => {
    const fixture = fixtureWithNeighbour();
    markValidity(fixture.neighbour.mesh, false);
    const instances = fixture.compile().instances;
    expect(instances.map((brush) => brush.id).filter((id) => id.startsWith(`${fixture.neighbour.id}#`))).toEqual([]);
    expect(instances).toHaveLength(2 + 2);
    expect(modifierStackStatusRead(fixture.volume)).toMatchObject({ captured: 1, derived: 2, skipped: 1 });
    fixture.refresh();
    const without = stackFixture([LINEAR]);
    without.refresh();
    expect(resultPositions(fixture.model)).toEqual(resultPositions(without.model));
  });

  it('brings the copies back when the source becomes valid again', () => {
    const fixture = fixtureWithNeighbour();
    expect(fixture.compile().instances).toHaveLength(6);
    markValidity(fixture.neighbour.mesh, false);
    expect(fixture.compile().instances).toHaveLength(4);
    markValidity(fixture.neighbour.mesh, true);
    expect(fixture.compile().instances).toHaveLength(6);
    expect(modifierStackStatusRead(fixture.volume)).toMatchObject({ captured: 2, derived: 4, skipped: 0 });
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.y).toBeCloseTo(2.5);
  });

  it('skips an invalid brush inside a captured group and still copies the rest of the group', () => {
    const fixture = fixtureWithNeighbour();
    const group = new THREE.Group();
    fixture.model.root.add(group);
    if (fixture.source.mesh) group.add(fixture.source.mesh);
    if (fixture.neighbour.mesh) group.add(fixture.neighbour.mesh);
    markValidity(fixture.neighbour.mesh, false);
    const ids = fixture.compile().instances.map((brush) => brush.id);
    expect(ids.filter((id) => id.startsWith(`${fixture.source.id}#`))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith(`${fixture.neighbour.id}#`))).toHaveLength(0);
    expect(isSolidBrushMarkedNonConvex(fixture.neighbour.mesh as THREE.Mesh)).toBe(true);
  });

  it('drops invalid generated brushes before later modifiers and the CSG pipeline see them', () => {
    corruptKind('linear', (copies) => {
      copies[0]?.forEach((vertex) => vertex.setX(0));
      copies[1]?.[0]?.set(Number.NaN, 0, 0);
    });
    const fixture = stackFixture([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 2, count: 4 } }, 'bevel']);
    const instances = fixture.compile().instances;
    expect(instances).toHaveLength(1 + 1);
    for (const instance of instances) expect(modifierStackBrushGeometryValid(instance.brush)).toBe(true);
    expect(modifierStackStatusRead(fixture.volume)?.steps[0]?.error).toContain('Skipped 2 invalid generated brush(es)');
    fixture.refresh();
    expect(stackResultBounds(fixture.model).max.x).toBeCloseTo(6.5);
  });

  it('keeps brushes unbevelled when their bevel would be invalid', () => {
    const validate = SolidBrushValidator.validateGenerated.bind(SolidBrushValidator);
    vi.spyOn(SolidBrushValidator, 'validateGenerated').mockImplementation((brush) =>
      brush.vertices.length > 8 ? { valid: false, errors: ['test'] } : validate(brush),
    );
    const fixture = stackFixture([LINEAR, 'bevel'], 8);
    const instances = fixture.compile().instances;
    expect(instances).toHaveLength(3);
    for (const instance of instances) expect(instance.brush.vertices).toHaveLength(8);
    const status = modifierStackStatusRead(fixture.volume);
    expect(status?.unbevelled).toBe(1);
    expect(status?.steps[1]?.error).toContain(MODIFIER_STACK_BEVEL_REJECTED);
  });

  it('keeps an authored brush unbevelled when its bevel would be invalid', () => {
    const validate = SolidBrushValidator.validateGenerated.bind(SolidBrushValidator);
    vi.spyOn(SolidBrushValidator, 'validateGenerated').mockImplementation((brush) =>
      brush.vertices.length > 8 ? { valid: false, errors: ['test'] } : validate(brush),
    );
    const fixture = stackFixture(['bevel']);
    const instances = fixture.compile().instances;
    expect(instances).toEqual([fixture.source]);
    expect(modifierStackStatusRead(fixture.volume)?.unbevelled).toBe(1);
  });
});
