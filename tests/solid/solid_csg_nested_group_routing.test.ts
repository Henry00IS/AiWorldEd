import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidAlgorithmCategoryRoutingRow } from '@/solid/algorithm/routing/solid_algorithm_category_routing_row.js';

/** Nesting layout: a number adds that many unit boxes, an array adds a group. */
type Layout = (number | Layout)[];

/**
 * Adds unit boxes and additive groups under a parent following a layout.
 *
 * @param model Solid model.
 * @param parent Parent object.
 * @param layout Layout to add.
 */
function layoutAdd(model: SolidModel, parent: THREE.Object3D, layout: Layout): void {
  for (const item of layout) {
    if (typeof item === 'number') {
      for (let count = 0; count < item; count++) {
        parent.add(model.addBoxBrush(1, SolidOperation.Additive).mesh!);
      }
      continue;
    }
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    parent.add(group);
    layoutAdd(model, group, item);
  }
}

/**
 * Builds and compiles a model of stacked unit boxes.
 *
 * @param layout Nesting layout.
 * @param firstOffsetX X offset applied to the first box.
 * @returns Compiled model.
 */
function modelBuild(layout: Layout, firstOffsetX: number): SolidModel {
  const model = new SolidModel('NestedGroups');
  layoutAdd(model, model.root, layout);
  const first = model.getBrushes()[0]!;
  first.mesh!.position.x += firstOffsetX;
  first.mesh!.updateMatrix();
  model.syncBrushOrderFromScene();
  model.markDirty();
  model.rebuild(true);
  return model;
}

/**
 * Sums the result mesh triangle area.
 *
 * @param model Compiled model.
 * @returns Total surface area.
 */
function resultArea(model: SolidModel): number {
  const geometry = model.getResultMesh().geometry;
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!positions) return 0;
  const count = index ? index.count : positions.count;
  const corner = (k: number) => {
    const i = index ? index.getX(k) : k;
    return new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
  };
  let area = 0;
  for (let k = 0; k + 2 < count; k += 3) {
    const a = corner(k);
    area +=
      corner(k + 1)
        .sub(a)
        .cross(corner(k + 2).sub(a))
        .length() / 2;
  }
  return area;
}

describe('Solid CSG routing through nested groups of overlapping brushes', () => {
  const layout: Layout = [1, [1, [1, [5]]], 1];

  it('builds one box from identical boxes spread over nested groups', () => {
    expect(resultArea(modelBuild(layout, 0))).toBeCloseTo(6, 6);
  });

  it('builds the union when one box sticks out of the stack', () => {
    expect(resultArea(modelBuild(layout, 0.5))).toBeCloseTo(8, 6);
  });

  it('keeps routing row destinations above 255', () => {
    const row = SolidAlgorithmCategoryRoutingRow.Identity.plusOffset(300);
    expect(Array.from(row.destinations)).toEqual([300, 301, 302, 303, 304, 305]);
  });
});
