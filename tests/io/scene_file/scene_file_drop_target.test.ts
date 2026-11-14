import { afterEach, describe, expect, it } from 'vitest';
import { SceneFileDropTarget, type SceneFileDropLevel } from '@/io/scene_file/drop/scene_file_drop_target.js';

/**
 * Files dropped anywhere on the editor: a level file opens, other files are
 * kept from replacing the page, and drops another element already took (the
 * chat window's file transfer) are left alone.
 */
describe('scene file drop target', () => {
  const targets: SceneFileDropTarget[] = [];
  afterEach(() => {
    targets.splice(0).forEach((target) => target.dispose());
    document.body.innerHTML = '';
  });

  it('opens a level file dropped anywhere in the editor', () => {
    const levels: SceneFileDropLevel[] = [];
    targets.push(
      new SceneFileDropTarget(
        document,
        (level) => levels.push(level),
        () => undefined,
      ),
    );
    const event = dispatchFileDrop(document.body, [new File(['{}'], 'castle.aiworld')]);
    expect(event.defaultPrevented).toBe(true);
    expect(levels.map((level) => level.file.name)).toEqual(['castle.aiworld']);
  });

  it('picks the level file when other files are dropped with it', () => {
    const levels: SceneFileDropLevel[] = [];
    targets.push(
      new SceneFileDropTarget(
        document,
        (level) => levels.push(level),
        () => undefined,
      ),
    );
    dispatchFileDrop(document.body, [new File(['x'], 'notes.txt'), new File(['{}'], 'Docks.AIWORLD')]);
    expect(levels.map((level) => level.file.name)).toEqual(['Docks.AIWORLD']);
  });

  it('keeps other dropped files from replacing the page without opening anything', () => {
    let levelCount = 0;
    let otherCount = 0;
    targets.push(
      new SceneFileDropTarget(
        document,
        () => levelCount++,
        () => otherCount++,
      ),
    );
    const event = dispatchFileDrop(document.body, [new File(['x'], 'photo.png')]);
    expect(event.defaultPrevented).toBe(true);
    expect(levelCount).toBe(0);
    expect(otherCount).toBe(1);
  });

  it('leaves a drop alone that a drop target inside the editor already handled', () => {
    let levelCount = 0;
    targets.push(
      new SceneFileDropTarget(
        document,
        () => levelCount++,
        () => undefined,
      ),
    );
    const chat = document.createElement('div');
    document.body.appendChild(chat);
    chat.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    dispatchFileDrop(chat, [new File(['{}'], 'castle.aiworld')]);
    expect(levelCount).toBe(0);
  });

  it('accepts file drags over the editor so the drop reaches it', () => {
    targets.push(
      new SceneFileDropTarget(
        document,
        () => undefined,
        () => undefined,
      ),
    );
    const event = dispatchFileDrag(document.body, 'dragover', [new File(['{}'], 'castle.aiworld')]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops listening once disposed', () => {
    let levelCount = 0;
    const target = new SceneFileDropTarget(
      document,
      () => levelCount++,
      () => undefined,
    );
    target.dispose();
    dispatchFileDrop(document.body, [new File(['{}'], 'castle.aiworld')]);
    expect(levelCount).toBe(0);
  });
});

/**
 * Dispatches a cancelable file drop on an element.
 *
 * @param element Drop target element.
 * @param files Dropped files.
 * @returns The dispatched event.
 */
function dispatchFileDrop(element: HTMLElement, files: File[]): Event {
  return dispatchFileDrag(element, 'drop', files);
}

/**
 * Dispatches a cancelable drag event carrying files.
 *
 * @param element Event target.
 * @param type Drag event type.
 * @param files Dragged files.
 * @returns The dispatched event.
 */
function dispatchFileDrag(element: HTMLElement, type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const items = files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file }));
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, items, dropEffect: 'none' },
  });
  element.dispatchEvent(event);
  return event;
}
