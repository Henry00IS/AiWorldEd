import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OutlinerItem } from '@/outliner/ui/outliner_item.js';
import { OutlinerTreeDragSession, type OutlinerTreeDragHost } from '@/outliner/ui/outliner_tree_drag_session.js';
import {
  OUTLINER_ROW_HEIGHT_PX,
  OUTLINER_TREE_PADDING_PX,
  outlinerRowDepthOffsetPx,
} from '@/outliner/ui/outliner_drop_placement.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { getOutlinerContentChildren } from '@/outliner/ui/outliner_tree_hierarchy.js';

/** Drop reported by the session. */
interface ReportedDrop {
  source: THREE.Object3D;
  target: THREE.Object3D;
  placement: string;
}

/**
 * Tree fixture: a solid model whose last row is the only brush of an expanded
 * group.
 */
interface SolidDragFixture {
  session: OutlinerTreeDragSession;
  treeElement: HTMLElement;
  itemMap: Map<THREE.Object3D, OutlinerItem>;
  model: SolidModel;
  loose: THREE.Mesh;
  group: THREE.Group;
  inner: THREE.Mesh;
  drops: ReportedDrop[];
}

/**
 * Stubs a row's bounds for a fixed row index.
 *
 * @param element Row element.
 * @param index Visible row index.
 */
function rowBoundsStub(element: HTMLElement, index: number): void {
  const top = OUTLINER_TREE_PADDING_PX + index * OUTLINER_ROW_HEIGHT_PX;
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + OUTLINER_ROW_HEIGHT_PX,
      left: 0,
      right: 200,
      width: 200,
      height: OUTLINER_ROW_HEIGHT_PX,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * Builds World > Solid > [Loose, Group > [Inner]] with every row expanded.
 *
 * @returns Fixture.
 */
function fixtureCreate(): SolidDragFixture {
  const world = new THREE.Group();
  const model = new SolidModel('Solid');
  world.add(model.root);
  const looseBrush = model.addBoxBrush(2, SolidOperation.Additive);
  const innerBrush = model.addBoxBrush(1, SolidOperation.Additive);
  const group = new THREE.Group();
  markAsSolidCsgGroup(group);
  model.root.add(group);
  group.add(innerBrush.mesh as THREE.Mesh);
  model.syncBrushOrderFromScene();
  const rows: THREE.Object3D[] = [model.root, looseBrush.mesh as THREE.Mesh, group, innerBrush.mesh as THREE.Mesh];
  const treeElement = document.createElement('div');
  document.body.appendChild(treeElement);
  Object.defineProperty(treeElement, 'clientWidth', { value: 200, configurable: true });
  treeElement.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 400, right: 200, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const depthOf = (object: THREE.Object3D): number => {
    let depth = -1;
    for (let current = object.parent; current; current = current.parent) depth += 1;
    return depth;
  };
  const itemMap = new Map<THREE.Object3D, OutlinerItem>();
  rows.forEach((object, index) => {
    const item = new OutlinerItem(object, depthOf(object), object instanceof THREE.Group);
    rowBoundsStub(item.getElement(), index);
    itemMap.set(object, item);
    treeElement.appendChild(item.getElement());
  });
  const drops: ReportedDrop[] = [];
  const host: OutlinerTreeDragHost = {
    getRoot: () => world,
    getTreeElement: () => treeElement,
    getItemMap: () => itemMap,
    getLogicalObjects: () => rows,
    getScrollOffsetPx: () => 0,
    scrollByDeltaPx: () => false,
    getObjectDepth: depthOf,
    isExpanded: () => true,
    getContentChildren: (parent) => getOutlinerContentChildren(parent),
    getOnReparent: () => (source, target, placement) => drops.push({ source, target, placement }),
  };
  const session = new OutlinerTreeDragSession(host);
  session.insertIndicatorAttach(treeElement);
  return {
    session,
    treeElement,
    itemMap,
    model,
    loose: looseBrush.mesh as THREE.Mesh,
    group,
    inner: innerBrush.mesh as THREE.Mesh,
    drops,
  };
}

/**
 * Builds a drag event stub.
 *
 * @param clientX Pointer X.
 * @param clientY Pointer Y.
 * @returns DragEvent-like object.
 */
function dragEventCreate(clientX: number, clientY: number): DragEvent {
  return { clientX, clientY, preventDefault() {}, dataTransfer: { dropEffect: 'move' } } as DragEvent;
}

/** Pointer Y on the lower part of the last row (Inner). */
const LAST_ROW_LOWER_Y = OUTLINER_TREE_PADDING_PX + 3 * OUTLINER_ROW_HEIGHT_PX + OUTLINER_ROW_HEIGHT_PX - 3;

/** Drops after an expanded group that is the last item of a solid model. */
describe('OutlinerTreeDragSession drop after the last group of a solid model', () => {
  it('drops a brush beside the group when the pointer is left of the group children', () => {
    const fixture = fixtureCreate();
    fixture.session.dragSessionBegin(fixture.loose);
    fixture.session.itemDropHandle(fixture.inner, dragEventCreate(outlinerRowDepthOffsetPx(1), LAST_ROW_LOWER_Y));
    expect(fixture.drops).toEqual([{ source: fixture.loose, target: fixture.group, placement: 'after' }]);
    fixture.treeElement.remove();
  });

  it('never resolves past the solid model for a brush, even at the far left', () => {
    const fixture = fixtureCreate();
    fixture.session.dragSessionBegin(fixture.loose);
    fixture.session.itemDropHandle(fixture.inner, dragEventCreate(1, LAST_ROW_LOWER_Y));
    expect(fixture.drops).toEqual([{ source: fixture.loose, target: fixture.group, placement: 'after' }]);
    fixture.treeElement.remove();
  });

  it('still nests inside the group when the pointer is at the child indent', () => {
    const fixture = fixtureCreate();
    fixture.session.dragSessionBegin(fixture.loose);
    fixture.session.itemDropHandle(fixture.inner, dragEventCreate(outlinerRowDepthOffsetPx(2) + 30, LAST_ROW_LOWER_Y));
    expect(fixture.drops).toEqual([{ source: fixture.loose, target: fixture.inner, placement: 'after' }]);
    fixture.treeElement.remove();
  });

  it('moves the last child out of its group from its own row', () => {
    const fixture = fixtureCreate();
    fixture.session.dragSessionBegin(fixture.inner);
    fixture.session.itemDragHoverHandle(fixture.inner, dragEventCreate(1, LAST_ROW_LOWER_Y));
    expect(fixture.session.insertIndicatorElementGet().style.display).toBe('block');
    fixture.session.itemDropHandle(fixture.inner, dragEventCreate(1, LAST_ROW_LOWER_Y));
    expect(fixture.drops).toEqual([{ source: fixture.inner, target: fixture.group, placement: 'after' }]);
    fixture.treeElement.remove();
  });
});
