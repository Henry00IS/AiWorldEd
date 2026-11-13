import { afterEach, describe, expect, it } from 'vitest';
import { APPLICATION_DISPLAY_NAME, buildDesktopWindowTitle, buildWindowTitle } from '@/application_identity.js';
import {
  EditorWindowTitle,
  editorWindowTitleInstall,
  editorWindowTitleRoomFrom,
  editorWindowTitleSetFile,
  editorWindowTitleSetRoom,
  editorWindowTitleUninstall,
  windowTitleFileName,
} from '@/ui/window_title.js';

describe('buildWindowTitle', () => {
  it('uses the app name alone in the browser when no file is open', () => {
    expect(buildWindowTitle()).toBe('AI World Editor');
    expect(buildWindowTitle({ fileName: null, roomName: null })).toBe(APPLICATION_DISPLAY_NAME);
  });

  it('puts the active file name first in the browser', () => {
    expect(buildWindowTitle({ fileName: 'start.aiworld' })).toBe('start - AI World Editor');
  });

  it('strips only the last extension from a normal file name', () => {
    expect(buildWindowTitle({ fileName: 'Start.aiworld' })).toBe('Start - AI World Editor');
  });

  it('keeps earlier dots when stripping the last extension', () => {
    expect(buildWindowTitle({ fileName: 'my.level.aiworld' })).toBe('my.level - AI World Editor');
  });

  it('falls back to the app name when only an extension remains', () => {
    expect(buildWindowTitle({ fileName: '.aiworld' })).toBe('AI World Editor');
    expect(buildWindowTitle({ fileName: '.aiworld', includeVersion: true, version: '2.3.4' })).toBe(
      'AI World Editor 2.3.4',
    );
  });

  it('falls back to the app name when the file name is empty', () => {
    expect(buildWindowTitle({ fileName: '' })).toBe('AI World Editor');
    expect(buildWindowTitle({ fileName: '   ', includeVersion: true, version: '2.3.4' })).toBe('AI World Editor 2.3.4');
  });

  it('puts the room name first in the browser, ahead of any file name', () => {
    expect(buildWindowTitle({ fileName: 'start.aiworld', roomName: 'Night Shift' })).toBe(
      'Night Shift - AI World Editor',
    );
  });

  it('appends the installed version on desktop when no file is open', () => {
    expect(buildWindowTitle({ includeVersion: true, version: '2.3.4' })).toBe('AI World Editor 2.3.4');
    expect(buildDesktopWindowTitle('2.3.4')).toBe('AI World Editor 2.3.4');
  });

  it('appends the installed version on desktop after the file name', () => {
    expect(buildWindowTitle({ fileName: 'start.aiworld', includeVersion: true, version: '2.3.4' })).toBe(
      'start - AI World Editor 2.3.4',
    );
  });

  it('appends the installed version on desktop after the room name', () => {
    expect(
      buildWindowTitle({
        fileName: 'start.aiworld',
        roomName: 'Night Shift',
        includeVersion: true,
        version: '2.3.4',
      }),
    ).toBe('Night Shift - AI World Editor 2.3.4');
  });
});

describe('windowTitleFileName', () => {
  it('keeps the file name with its extension and drops folder path', () => {
    expect(windowTitleFileName('start.aiworld')).toBe('start.aiworld');
    expect(windowTitleFileName('maps/start.aiworld')).toBe('start.aiworld');
    expect(windowTitleFileName('C:\\Levels\\start.aiworld')).toBe('start.aiworld');
    expect(windowTitleFileName('  ')).toBeNull();
    expect(windowTitleFileName(null)).toBeNull();
  });
});

describe('EditorWindowTitle', () => {
  const titles: string[] = [];
  let title: EditorWindowTitle;

  afterEach(() => {
    editorWindowTitleUninstall();
    titles.length = 0;
  });

  function create(includeVersion = false, version = '2.3.4'): EditorWindowTitle {
    title = new EditorWindowTitle({
      includeVersion,
      version,
      setTitle: (value) => {
        titles.push(value);
      },
    });
    return title;
  }

  it('updates on open, Save As, and a new level', () => {
    const windowTitle = create();
    windowTitle.apply();
    expect(titles.at(-1)).toBe('AI World Editor');

    windowTitle.setFileName('maps/start.aiworld');
    expect(titles.at(-1)).toBe('start - AI World Editor');

    windowTitle.setFileName('alley.aiworld');
    expect(titles.at(-1)).toBe('alley - AI World Editor');

    windowTitle.setFileName(null);
    expect(titles.at(-1)).toBe('AI World Editor');
  });

  it('updates on joining and leaving a room, and on a room rename', () => {
    const windowTitle = create();
    windowTitle.setFileName('start.aiworld');
    windowTitle.setRoomName('Night Shift');
    expect(titles.at(-1)).toBe('Night Shift - AI World Editor');

    windowTitle.setRoomName('Graveyard');
    expect(titles.at(-1)).toBe('Graveyard - AI World Editor');

    windowTitle.setRoomName(null);
    expect(titles.at(-1)).toBe('start - AI World Editor');
  });

  it('writes the same desktop title the native window should show', () => {
    const windowTitle = create(true, '1.203.0');
    windowTitle.setFileName('start.aiworld');
    expect(titles.at(-1)).toBe('start - AI World Editor 1.203.0');
  });

  it('applies file and room changes through the installed editor title', () => {
    editorWindowTitleInstall(create());
    editorWindowTitleSetFile('start.aiworld');
    expect(titles.at(-1)).toBe('start - AI World Editor');
    editorWindowTitleSetRoom('Night Shift');
    expect(titles.at(-1)).toBe('Night Shift - AI World Editor');
    editorWindowTitleSetRoom(null);
    expect(titles.at(-1)).toBe('start - AI World Editor');
  });
});

describe('editorWindowTitleRoomFrom', () => {
  it('uses the joined room name and clears it when the session ends', () => {
    expect(editorWindowTitleRoomFrom({ session: null, room: { name: 'Night Shift' } })).toBeNull();
    expect(editorWindowTitleRoomFrom({ session: {}, room: { name: 'Night Shift' } })).toBe('Night Shift');
    expect(editorWindowTitleRoomFrom({ session: {}, room: null })).toBeNull();
  });
});
