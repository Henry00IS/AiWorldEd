import { describe, it, expect, vi } from 'vitest';
import {
  SceneFileSession,
  SCENE_FILE_DEFAULT_NAME,
  SCENE_FILE_PICKER_ID,
  type SceneFileHandle,
  type SceneFilePickerWindow,
  type SceneFileWriter,
} from '@/io/scene_file/scene_file_session.js';

/** In-memory file handle that records every write. */
interface RecordingHandle extends SceneFileHandle {
  writes: string[];
  aborted: number;
}

/**
 * Builds a writer that streams a text in two chunks.
 *
 * @param value Text.
 * @returns Writer.
 */
function text(value: string): SceneFileWriter {
  return async (sink) => {
    const bytes = new TextEncoder().encode(value);
    await sink(bytes.subarray(0, 1));
    await sink(bytes.subarray(1));
  };
}

/**
 * Creates an in-memory file handle.
 *
 * @param name File name.
 * @param initialText Initial file contents.
 * @param permission Permission state reported by query/request.
 * @returns Recording handle.
 */
function createHandle(name: string, initialText = '', permission: PermissionState = 'granted'): RecordingHandle {
  const handle: RecordingHandle = {
    name,
    writes: [],
    aborted: 0,
    getFile: async () => new File([handle.writes.at(-1) ?? initialText], name),
    createWritable: async () => {
      let buffered = '';
      return {
        write: async (data: Uint8Array<ArrayBuffer>) => {
          buffered += new TextDecoder().decode(data);
        },
        close: async () => {
          handle.writes.push(buffered);
        },
        abort: async () => {
          handle.aborted += 1;
        },
      };
    },
    queryPermission: async () => permission,
    requestPermission: async () => permission,
  };
  return handle;
}

/**
 * Builds a session whose pickers return the given handles.
 *
 * @param saveHandle Handle returned by the save picker.
 * @param openHandle Handle returned by the open picker.
 * @returns Session plus picker spies.
 */
function createSession(saveHandle: RecordingHandle, openHandle: RecordingHandle) {
  const pickerWindow: SceneFilePickerWindow = {
    showSaveFilePicker: vi.fn(async () => saveHandle),
    showOpenFilePicker: vi.fn(async () => [openHandle]),
  };
  const session = new SceneFileSession(
    pickerWindow,
    vi.fn(),
    vi.fn(async () => null),
  );
  return { session, pickerWindow };
}

describe('SceneFileSession', () => {
  it('prompts on the first Save, then writes back to the same file without prompting', async () => {
    const target = createHandle('level.aiworld');
    const { session, pickerWindow } = createSession(target, createHandle('unused.aiworld'));
    expect(await session.save(text('first'))).toBe('level.aiworld');
    expect(await session.save(text('second'))).toBe('level.aiworld');
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(target.writes).toEqual(['first', 'second']);
    expect(session.getCurrentFilename()).toBe('level.aiworld');
  });

  it('Save on a level that is not an .aiworld file asks where to save it as .aiworld', async () => {
    const opened = createHandle('old.json', '{"a":1}');
    const target = createHandle('old.aiworld');
    const { session, pickerWindow } = createSession(target, opened);
    await session.open();
    expect(await session.save(text('zip'))).toBe('old.aiworld');
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'old.aiworld' }),
    );
    expect(opened.writes).toEqual([]);
    expect(target.writes).toEqual(['zip']);
    await session.save(text('again'));
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledTimes(1);
  });

  it('writes to the opened file on Save and starts the picker in its folder', async () => {
    const opened = createHandle('opened.aiworld', 'PK');
    const { session, pickerWindow } = createSession(createHandle('other.aiworld'), opened);
    const result = await session.open();
    expect(result?.filename).toBe('opened.aiworld');
    expect(await result?.file.text()).toBe('PK');
    await session.save(text('edited'));
    expect(pickerWindow.showSaveFilePicker).not.toHaveBeenCalled();
    expect(opened.writes).toEqual(['edited']);
    await session.saveAs(text('copy'));
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ id: SCENE_FILE_PICKER_ID, startIn: opened, suggestedName: 'opened.aiworld' }),
    );
  });

  it('Save As always prompts and switches the remembered file', async () => {
    const firstTarget = createHandle('a.aiworld');
    const { session, pickerWindow } = createSession(firstTarget, createHandle('unused.aiworld'));
    await session.save(text('one'));
    const secondTarget = createHandle('b.aiworld');
    vi.mocked(pickerWindow.showSaveFilePicker!).mockResolvedValueOnce(secondTarget);
    expect(await session.saveAs(text('two'))).toBe('b.aiworld');
    await session.save(text('three'));
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledTimes(2);
    expect(firstTarget.writes).toEqual(['one']);
    expect(secondTarget.writes).toEqual(['two', 'three']);
  });

  it('forget (New) makes the next Save prompt with the default name again', async () => {
    const { session, pickerWindow } = createSession(createHandle('a.json'), createHandle('unused.json'));
    await session.save(text('one'));
    session.forget();
    expect(session.getCurrentFilename()).toBeNull();
    expect(session.hasWritableTarget()).toBe(false);
    await session.save(text('two'));
    expect(pickerWindow.showSaveFilePicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ suggestedName: SCENE_FILE_DEFAULT_NAME }),
    );
    expect(vi.mocked(pickerWindow.showSaveFilePicker!).mock.calls.at(-1)![0].startIn).toBeUndefined();
  });

  it('falls back to Save As when write permission to the remembered file is denied', async () => {
    const denied = createHandle('locked.json', '', 'denied');
    const replacement = createHandle('new.json');
    const { session, pickerWindow } = createSession(replacement, denied);
    await session.open();
    expect(await session.save(text('data'))).toBe('new.json');
    expect(pickerWindow.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(denied.writes).toEqual([]);
    expect(replacement.writes).toEqual(['data']);
  });

  it('returns null and keeps the previous file when the picker is cancelled', async () => {
    const target = createHandle('keep.json');
    const { session, pickerWindow } = createSession(target, createHandle('unused.json'));
    await session.save(text('one'));
    vi.mocked(pickerWindow.showSaveFilePicker!).mockRejectedValueOnce(new DOMException('cancel', 'AbortError'));
    expect(await session.saveAs(text('two'))).toBeNull();
    expect(session.getCurrentFilename()).toBe('keep.json');
  });

  it('without the picker API downloads under the last opened filename', async () => {
    const downloader = vi.fn();
    const fallbackPicker = vi.fn(async () => new File(['{}'], 'picked.json'));
    const session = new SceneFileSession({}, downloader, fallbackPicker);
    expect((await session.open())?.filename).toBe('picked.json');
    // A legacy .json level downloads under the new extension.
    expect(await session.save(text('data'))).toBe('picked.aiworld');
    expect(downloader).toHaveBeenCalledWith(expect.any(Blob), 'picked.aiworld');
    expect(await (downloader.mock.calls[0]![0] as Blob).text()).toBe('data');
    expect(session.hasWritableTarget()).toBe(false);
  });

  it('aborts the write when the writer fails, so the file keeps its old contents', async () => {
    const target = createHandle('level.aiworld', 'old');
    const { session } = createSession(target, target);
    await session.open();
    const failing: SceneFileWriter = async (sink) => {
      await sink(new TextEncoder().encode('half'));
      throw new Error('texture unreadable');
    };
    expect(await session.save(failing)).toBeNull();
    expect(target.aborted).toBeGreaterThan(0);
    expect(target.writes).toEqual([]);
    expect(await (await session.currentFile())?.text()).toBe('old');
  });

  it('lists only .aiworld in the Save picker and .aiworld plus .json in the Open picker', async () => {
    const { session, pickerWindow } = createSession(createHandle('level.aiworld'), createHandle('old.json', '{}'));
    await session.saveAs(text('zip'));
    await session.open();
    const saveAccept = vi.mocked(pickerWindow.showSaveFilePicker!).mock.calls[0]![0].types[0]!.accept;
    const openAccept = vi.mocked(pickerWindow.showOpenFilePicker!).mock.calls[0]![0].types[0]!.accept;

    expect(Object.values(saveAccept).flat()).toEqual(['.aiworld']);
    expect(Object.values(openAccept).flat()).toEqual(['.aiworld', '.json']);
    for (const mimeType of [...Object.keys(saveAccept), ...Object.keys(openAccept)]) {
      expect(OS_REGISTERED_MIME_TYPES).not.toContain(mimeType);
    }
  });
});

/** MIME types the OS maps to extensions of their own, which pickers would add. */
const OS_REGISTERED_MIME_TYPES = ['application/zip', 'application/json', 'text/plain', 'application/octet-stream'];
