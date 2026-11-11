import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { OutlinerItem } from '@/outliner/ui/outliner_item.js';
import { OutlinerInsertIndicator } from '@/outliner/ui/outliner_insert_indicator.js';
import { OutlinerTreeDragSession, type OutlinerTreeDragHost } from '@/outliner/ui/outliner_tree_drag_session.js';
import { OUTLINER_ROW_HEIGHT_PX, OUTLINER_TREE_PADDING_PX } from '@/outliner/ui/outliner_drop_placement.js';

/**
 * Builds a drag host backed by a flat list of objects for drag feedback tests.
 *
 * @param count Number of root-level rows.
 * @param createObject Factory for each row object.
 * @returns Host fixtures for drag session tests.
 */
function createFlatDragHost(
  count: number,
  createObject: (index: number) => THREE.Object3D = (index) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = `Mesh${index}`;
    return mesh;
  },
): {
  host: OutlinerTreeDragHost;
  itemMap: Map<THREE.Object3D, OutlinerItem>;
  treeElement: HTMLElement;
  objects: THREE.Object3D[];
  session: OutlinerTreeDragSession;
} {
  const root = new THREE.Group();
  root.name = 'World';
  const itemMap = new Map<THREE.Object3D, OutlinerItem>();
  const treeElement = document.createElement('div');
  treeElement.style.position = 'relative';
  document.body.appendChild(treeElement);
  Object.defineProperty(treeElement, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(treeElement, 'scrollTop', { value: 0, configurable: true, writable: true });
  treeElement.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      bottom: 400,
      right: 200,
      width: 200,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const objects: THREE.Object3D[] = [];
  for (let index = 0; index < count; index += 1) {
    const object = createObject(index);
    root.add(object);
    objects.push(object);
    const item = new OutlinerItem(object, 0, object instanceof THREE.Group);
    const row = item.getElement();
    const top = OUTLINER_TREE_PADDING_PX + index * OUTLINER_ROW_HEIGHT_PX;
    row.getBoundingClientRect = () =>
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
    itemMap.set(object, item);
    treeElement.appendChild(row);
  }
  const host: OutlinerTreeDragHost = {
    getRoot: () => root,
    getTreeElement: () => treeElement,
    getItemMap: () => itemMap,
    getLogicalObjects: () => objects,
    getScrollOffsetPx: () => treeElement.scrollTop,
    scrollByDeltaPx: (deltaY) => {
      const previous = treeElement.scrollTop;
      treeElement.scrollTop = previous + deltaY;
      return treeElement.scrollTop !== previous;
    },
    getObjectDepth: () => 0,
    isExpanded: () => true,
    getContentChildren: (parent) => parent.children.slice(),
    getOnReparent: () => null,
  };
  const session = new OutlinerTreeDragSession(host);
  session.insertIndicatorAttach(treeElement);
  for (const item of itemMap.values()) {
    session.itemDragDropCallbacksBind(item);
  }
  return { host, itemMap, treeElement, objects, session };
}

/**
 * Builds a drag event stub for hover tests.
 *
 * @param clientX Pointer X.
 * @param clientY Pointer Y.
 * @returns DragEvent-like object.
 */
function createDragEvent(clientX: number, clientY: number): DragEvent {
  return {
    clientX,
    clientY,
    preventDefault() {},
    dataTransfer: { dropEffect: 'move' },
  } as DragEvent;
}

describe('OutlinerTreeDragSession', () => {
  it('should clear into-highlight only on the previous into row', () => {
    const { itemMap, treeElement, objects, session } = createFlatDragHost(100, (index) => {
      const group = new THREE.Group();
      group.name = `Group${index}`;
      return group;
    });
    const spies = Array.from(itemMap.values()).map((item) => vi.spyOn(item, 'setIntoDropHighlight'));
    session.dragSessionBegin(objects[0]!);
    const midY = (index: number) =>
      OUTLINER_TREE_PADDING_PX + index * OUTLINER_ROW_HEIGHT_PX + OUTLINER_ROW_HEIGHT_PX / 2;
    session.itemDragHoverHandle(objects[10]!, createDragEvent(80, midY(10)));
    session.itemDragHoverHandle(objects[20]!, createDragEvent(80, midY(20)));
    const falseCallItems = spies.filter((spy) => spy.mock.calls.some((call) => call[0] === false));
    expect(falseCallItems.length).toBe(1);
    expect(spies[10]!.mock.calls.some((call) => call[0] === true)).toBe(true);
    expect(spies[20]!.mock.calls.some((call) => call[0] === true)).toBe(true);
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should resolve host hits via fixed-height index without scanning all rows', () => {
    const { treeElement, objects, session } = createFlatDragHost(200);
    session.dragSessionBegin(objects[0]!);
    const targetIndex = 120;
    const clientY = OUTLINER_TREE_PADDING_PX + targetIndex * OUTLINER_ROW_HEIGHT_PX + 4;
    session['treeHostDragOverHandle'](createDragEvent(12, clientY));
    expect(session.insertIndicatorElementGet().style.display).toBe('block');
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should skip redundant insert-line updates when the drop stays the same', () => {
    const showSpy = vi.spyOn(OutlinerInsertIndicator.prototype, 'showAtHostLocalY');
    const { treeElement, objects, session } = createFlatDragHost(50);
    session.dragSessionBegin(objects[0]!);
    const target = objects[5]!;
    const clientY = OUTLINER_TREE_PADDING_PX + 5 * OUTLINER_ROW_HEIGHT_PX + 2;
    session.itemDragHoverHandle(target, createDragEvent(12, clientY));
    expect(showSpy).toHaveBeenCalledTimes(1);
    session.itemDragHoverHandle(target, createDragEvent(12, clientY));
    session.itemDragHoverHandle(target, createDragEvent(12, clientY));
    expect(showSpy).toHaveBeenCalledTimes(1);
    showSpy.mockRestore();
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should scroll the tree with the wheel during an active drag', () => {
    const { treeElement, objects, session } = createFlatDragHost(40);
    session.dragSessionBegin(objects[0]!);
    treeElement.scrollTop = 10;
    const wheel = new WheelEvent('wheel', {
      deltaY: 80,
      clientX: 50,
      clientY: 100,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(wheel);
    expect(prevented || wheel.defaultPrevented).toBe(true);
    expect(treeElement.scrollTop).toBe(90);
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should not scroll the tree with the wheel when the pointer is outside', () => {
    const { treeElement, objects, session } = createFlatDragHost(20);
    session.dragSessionBegin(objects[0]!);
    treeElement.scrollTop = 0;
    const wheel = new WheelEvent('wheel', {
      deltaY: 40,
      clientX: 800,
      clientY: 100,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(wheel);
    expect(treeElement.scrollTop).toBe(0);
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should reparent from a document-level drop over the tree', () => {
    const { host, treeElement, objects, session, itemMap } = createFlatDragHost(8);
    let reparented: { source: THREE.Object3D; target: THREE.Object3D; placement: string } | null = null;
    const originalGetOnReparent = host.getOnReparent;
    host.getOnReparent = () => (source, target, placement) => {
      reparented = { source, target, placement };
    };
    void originalGetOnReparent;
    session.dragSessionBegin(objects[0]!);
    const targetIndex = 4;
    const targetRow = itemMap.get(objects[targetIndex]!)!.getElement();
    document.elementsFromPoint = vi.fn(() => [targetRow]) as typeof document.elementsFromPoint;
    const clientY = OUTLINER_TREE_PADDING_PX + targetIndex * OUTLINER_ROW_HEIGHT_PX + 2;
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'clientX', { value: 40 });
    Object.defineProperty(drop, 'clientY', { value: clientY });
    Object.defineProperty(drop, 'target', { value: targetRow });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { dropEffect: 'move', effectAllowed: 'move' },
    });
    document.dispatchEvent(drop);
    expect(reparented).not.toBeNull();
    expect(reparented!.source).toBe(objects[0]);
    expect(reparented!.target).toBe(objects[targetIndex]);
    treeElement.remove();
  });

  it('should keep last resolved drop across tree dragleave with null relatedTarget', () => {
    const { treeElement, objects, session } = createFlatDragHost(12);
    session.dragSessionBegin(objects[0]!);
    const target = objects[3]!;
    const clientY = OUTLINER_TREE_PADDING_PX + 3 * OUTLINER_ROW_HEIGHT_PX + 2;
    session.itemDragHoverHandle(target, createDragEvent(20, clientY));
    expect(session.insertIndicatorElementGet().style.display).toBe('block');
    const leave = new Event('dragleave', { bubbles: true }) as DragEvent;
    Object.defineProperty(leave, 'clientX', { value: 20 });
    Object.defineProperty(leave, 'clientY', { value: clientY });
    Object.defineProperty(leave, 'relatedTarget', { value: null });
    treeElement.dispatchEvent(leave);
    session.itemDropHandle(target, createDragEvent(20, clientY));
    expect(session.insertIndicatorElementGet().style.display).toBe('none');
    treeElement.remove();
  });

  it('should edge-scroll gently on first dragover then faster after a long hold', () => {
    const { treeElement, objects, session } = createFlatDragHost(200);
    session.dragSessionBegin(objects[0]!);
    treeElement.scrollTop = 0;
    const dragOver = createDragEvent(40, 395);
    session['documentDragOverHandle'](dragOver);
    const earlyScroll = treeElement.scrollTop;
    expect(earlyScroll).toBeLessThan(OUTLINER_ROW_HEIGHT_PX * 2);
    session['edgeScroll']['holdStartedAtMs'] = performance.now() - 2500;
    session['edgeScroll'].tick();
    expect(treeElement.scrollTop).toBeGreaterThan(earlyScroll);
    expect(treeElement.scrollTop - earlyScroll).toBeGreaterThanOrEqual(OUTLINER_ROW_HEIGHT_PX * 4);
    session.dragSessionEnd();
    treeElement.remove();
  });

  it('should resolve deep rows in constant time without walking the full map', () => {
    const { treeElement, objects, session } = createFlatDragHost(1000);
    session.dragSessionBegin(objects[0]!);
    const targetIndex = 900;
    const clientY = OUTLINER_TREE_PADDING_PX + targetIndex * OUTLINER_ROW_HEIGHT_PX + 4;
    const started = performance.now();
    for (let step = 0; step < 100; step += 1) {
      session['pointerDropFeedbackRefresh'](12, clientY + (step % 3), null);
    }
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeLessThan(50);
    expect(session.insertIndicatorElementGet().style.display).toBe('block');
    session.dragSessionEnd();
    treeElement.remove();
  });
});
