import {
  configCollaborationDevelopmentDefault,
  configCollaborationNameGet,
  configCollaborationStorage,
  configCollaborationUrlGet,
} from '@/collaboration/config/config_collaboration_server.js';
import { SocketCollaborationBrowser } from '@/collaboration/net/socket_collaboration_browser.js';
import { ConnectionCollaborationTransfer } from '@/collaboration/transfer/connection_collaboration_transfer.js';

/**
 * Starts the always-on relay connection of the editor, using the configured
 * relay URL and display name.
 *
 * @returns Running connection.
 */
export function startCollaborationTransfer(): ConnectionCollaborationTransfer {
  const storage = configCollaborationStorage();
  const development = configCollaborationDevelopmentDefault();
  const connection = new ConnectionCollaborationTransfer({
    factory: (url) => new SocketCollaborationBrowser(url),
    url: () => configCollaborationUrlGet(storage, development),
    name: () => configCollaborationNameGet(storage),
  });
  connection.start();
  return connection;
}
