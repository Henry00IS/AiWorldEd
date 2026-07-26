import { Electroview } from 'electrobun/view';
import { buildDesktopWindowTitle } from '../../application_identity.js';
import {
  createElectrobunUpdaterBridge,
  type ElectrobunUpdaterRpcClient,
  type ElectrobunUpdaterRpcSchema,
} from '../../updater/electrobun_updater_rpc.js';
import { DesktopFullscreenShortcut } from '../desktop_fullscreen_shortcut.js';

document.title = buildDesktopWindowTitle();

const updaterRpc = Electroview.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: { requests: {} },
}) as unknown as ElectrobunUpdaterRpcClient;

new Electroview({ rpc: updaterRpc as never });
window.aiworldedStandaloneUpdater = createElectrobunUpdaterBridge(updaterRpc);
new DesktopFullscreenShortcut(() => updaterRpc.request.toggleFullscreen());
await import('../../app.js');
