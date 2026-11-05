import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  intakeCollaborationChatCanShare,
  intakeCollaborationChatFile,
  intakeCollaborationChatHasFile,
  intakeCollaborationChatNamed,
} from '@/collaboration/chat/intake_collaboration_chat.js';
import { ComposerCollaborationChat } from '@/collaboration/chat/composer_collaboration_chat.js';
import { ListCollaborationChat } from '@/collaboration/chat/list_collaboration_chat.js';
import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function fileOf(name: string, type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1 });
}

function transferOf(files: File[], items: Array<{ kind: string; type: string; file: File | null }> = []): DataTransfer {
  const list = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    *[Symbol.iterator]() {
      yield* files;
    },
  } as FileList;
  return {
    files: list,
    items: items as unknown as DataTransferItemList,
    types: files.length > 0 ? ['Files'] : [],
  } as unknown as DataTransfer;
}

describe('intakeCollaborationChat', () => {
  it('names unnamed screenshot blobs safely', () => {
    const raw = new File([new Uint8Array([1, 2, 3])], '', { type: 'image/png', lastModified: 1 });
    expect(intakeCollaborationChatNamed(raw).name).toBe('screenshot.png');
    const imagePng = fileOf('image.png', 'image/png');
    expect(intakeCollaborationChatNamed(imagePng).name).toBe('screenshot.png');
  });

  it('returns the first file only and dedupes overlapping files/items', () => {
    const a = fileOf('a.png', 'image/png', 8);
    const b = fileOf('b.png', 'image/png', 8);
    const data = transferOf(
      [a, b],
      [
        { kind: 'file', type: a.type, file: a },
        { kind: 'file', type: b.type, file: b },
      ],
    );
    expect(intakeCollaborationChatFile(data)?.name).toBe('a.png');
    expect(intakeCollaborationChatHasFile(data)).toBe(true);
  });

  it('gates share on the same cooldown flags as the attach button', () => {
    expect(intakeCollaborationChatCanShare(true, false, 0)).toBe(true);
    expect(intakeCollaborationChatCanShare(true, true, 0)).toBe(false);
    expect(intakeCollaborationChatCanShare(true, false, 500)).toBe(false);
    expect(intakeCollaborationChatCanShare(false, false, 0)).toBe(false);
  });

  it('paste prefers clipboard files and does not insert text when a file is present', () => {
    const shared: File[] = [];
    const composer = new ComposerCollaborationChat(
      () => undefined,
      (file) => shared.push(file),
    );
    document.body.append(composer.element);
    composer.stateSet({
      enabled: true,
      remainingMs: 0,
      sending: false,
      lengthMaximum: 2000,
      linesMaximum: 20,
      placeholder: 'Message',
    });
    const shot = fileOf('image.png', 'image/png', 16);
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: transferOf([shot], [{ kind: 'file', type: shot.type, file: shot }]),
    });
    composer.field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.name).toBe('screenshot.png');
    expect(composer.field.value).toBe('');
  });

  it('paste is ignored while cooling down (same as picker)', () => {
    const shared: File[] = [];
    const composer = new ComposerCollaborationChat(
      () => undefined,
      (file) => shared.push(file),
    );
    document.body.append(composer.element);
    composer.stateSet({
      enabled: true,
      remainingMs: 2000,
      sending: false,
      lengthMaximum: 2000,
      linesMaximum: 20,
      placeholder: 'Message',
    });
    const shot = fileOf('shot.png', 'image/png');
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: transferOf([shot]) });
    composer.field.dispatchEvent(event);
    expect(shared).toHaveLength(0);
  });
});

describe('listCollaborationChat cleanup', () => {
  it('aborts pending URL HEAD work on expire and clear so embeds cannot reappear', async () => {
    let resolveHead: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveHead = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const list = new ListCollaborationChat(() => 1_000);
    document.body.append(list.root);
    const entry: EntryCollaborationChat = {
      id: 1,
      from: 1,
      name: 'Ada',
      color: 3,
      text: 'see https://example.test/wsdev/transfer/AAAAAgAAAAEabcdef',
      at: 1_000,
    };
    expect(list.add(entry)).toBe(true);
    expect(fetchMock).toHaveBeenCalled();

    list.clear();
    expect(resolveHead).toBeTypeOf('function');
    resolveHead!(
      new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': '12',
          'Content-Disposition': 'inline; filename="x.jpg"',
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(list.root.querySelector('.editor-chat-link-embed')).toBeNull();
    expect(list.scroller.childElementCount).toBe(0);
  });
});
