import { afterEach, describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { CURVE_DRAG_TYPE, curveDragFile, curveDragGet, curveDragSet } from '@/curve/ui/curve_drag.js';
import { curveDropAccepts, curveDropRead } from '@/curve/ui/curve_drop.js';
import {
  RENDER_COLLABORATION_CHAT_ORIGIN_DRAG_TYPE,
  renderCollaborationChatCurve,
} from '@/collaboration/chat/render_collaboration_chat_curve.js';
import {
  intakeCollaborationChatDragHas,
  intakeCollaborationChatDropFile,
} from '@/collaboration/chat/intake_collaboration_chat.js';
import { PANEL_PROJECT_PATH_DRAG_TYPE } from '@/project/ui/panel_project_drag.js';
import { projectFileReaderSet } from '@/project/project_file_access.js';
import type { EntryCollaborationChatFile } from '@/collaboration/chat/entry_collaboration_chat.js';

/**
 * Builds a minimal DataTransfer: typed strings and no files.
 *
 * @returns Transfer.
 */
function transfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    get types() {
      return [...data.keys()];
    },
    files: [] as unknown as FileList,
    items: undefined,
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  } as unknown as DataTransfer;
}

const CURVE = curveFromPolyline([
  [0, 0.3],
  [0.5, 0.9],
  [1, 0.3],
]);
const TEXT = curveFileWrite(CURVE, 'Bump');

/**
 * Returns a shared .curve file.
 *
 * @returns Chat file.
 */
function shared(): EntryCollaborationChatFile {
  return {
    link: 'abc123',
    name: 'Bump.curve',
    size: TEXT.length,
    mime: 'application/json',
    url: 'http://relay/t/abc123',
  };
}

/** Waits for pending promises. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => projectFileReaderSet(null));

describe('dragged curves', () => {
  it('round-trips through a drag and loads into a curve field', async () => {
    const data = transfer();
    curveDragSet(data, { name: 'Bump', text: TEXT });
    expect(curveDragGet(data)).toEqual({ name: 'Bump', text: TEXT });
    expect(curveDropAccepts(data)).toBe(true);
    const result = await curveDropRead(data);
    expect(result && 'curve' in result ? result.curve.points.length : 0).toBe(3);
    const file = curveDragFile({ name: 'Bump.curve', text: TEXT });
    expect(file.name).toBe('Bump.curve');
    expect(await file.text()).toBe(TEXT);
  });

  it('sends a dragged curve or project file to the chat, but not a card dragged out of the chat', async () => {
    const curve = transfer();
    curveDragSet(curve, { name: 'profile', text: TEXT });
    expect(intakeCollaborationChatDragHas(curve)).toBe(true);
    expect((await intakeCollaborationChatDropFile(curve))?.name).toBe('profile.curve');
    projectFileReaderSet(async () => new Blob(['png bytes'], { type: 'image/png' }));
    const project = transfer();
    project.setData(PANEL_PROJECT_PATH_DRAG_TYPE, 'textures/wall.png');
    expect(intakeCollaborationChatDragHas(project)).toBe(true);
    const file = await intakeCollaborationChatDropFile(project);
    expect([file?.name, file?.type, await file?.text()]).toEqual(['wall.png', 'image/png', 'png bytes']);
    curve.setData(RENDER_COLLABORATION_CHAT_ORIGIN_DRAG_TYPE, 'abc123');
    expect(intakeCollaborationChatDragHas(curve)).toBe(false);
  });
});

describe('chat curve card', () => {
  it('fetches the curve once, offers link and download, and drags it as a curve', async () => {
    let fetches = 0;
    const fetcher = async () => {
      fetches++;
      return new Response(TEXT);
    };
    const file = shared();
    const card = renderCollaborationChatCurve(file, fetcher);
    expect(renderCollaborationChatCurve(file, fetcher)).toBe(card);
    await settle();
    expect(fetches).toBe(1);
    expect(card.classList.contains('editor-chat-file-curve')).toBe(true);
    expect(card.draggable).toBe(true);
    expect(card.querySelector('[aria-label="Copy link"]')).not.toBeNull();
    expect(card.querySelector('[aria-label="Download"]')).not.toBeNull();
    const data = transfer();
    const event = new Event('dragstart') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: data });
    card.dispatchEvent(event);
    expect(data.getData(CURVE_DRAG_TYPE)).toContain('Bump.curve');
    expect(curveDragGet(data)?.text).toBe(TEXT);
    expect(data.types).toContain(RENDER_COLLABORATION_CHAT_ORIGIN_DRAG_TYPE);
  });

  it('falls back to the plain file card when the curve cannot be read', async () => {
    const parent = document.createElement('div');
    const card = renderCollaborationChatCurve({ ...shared(), link: 'bad' }, async () => new Response('not a curve'));
    parent.append(card);
    await settle();
    expect(parent.querySelector('.editor-chat-file-curve')).toBeNull();
    expect(parent.querySelector('.editor-chat-file')).not.toBeNull();
  });
});
