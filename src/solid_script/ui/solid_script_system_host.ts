import { APPLICATION_DISPLAY_NAME } from '@/application_identity.js';
import {
  configCollaborationNameGet,
  configCollaborationStorage,
} from '@/collaboration/config/config_collaboration_server.js';
import { solidScriptSystemHostSet } from '@/solid_script/language/solid_script_system.js';
import { editorWindowTitleIsDesktop, editorWindowTitleNames, editorWindowTitleVersion } from '@/ui/window_title.js';

/** Tells scripts about this editor: its name, version, level, room and user. */
export function solidScriptSystemHostInstall(): void {
  solidScriptSystemHostSet(() => {
    const { fileName, roomName } = editorWindowTitleNames();
    return {
      editorName: APPLICATION_DISPLAY_NAME,
      editorVersion: editorWindowTitleVersion(),
      editorUrl: typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`,
      platform: editorWindowTitleIsDesktop() ? 'desktop' : 'browser',
      levelName: fileName ?? '',
      roomName: roomName ?? '',
      userName: configCollaborationNameGet(configCollaborationStorage()),
    };
  });
}
