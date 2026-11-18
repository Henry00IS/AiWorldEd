import { join } from 'node:path';
import { DISCORD_IPC_SOCKET_INDEX_MAXIMUM } from './discord_rich_presence_constants.js';

/** Environment variables that may hold a Unix runtime or temp directory. */
const DISCORD_IPC_UNIX_DIRECTORY_VARIABLES = ['XDG_RUNTIME_DIR', 'TMPDIR', 'TMP', 'TEMP'] as const;

/** Snap and Flatpak subdirectories that may contain the Discord IPC socket. */
const DISCORD_IPC_UNIX_SUBDIRECTORIES = [
  '',
  'snap.discord',
  'app/com.discordapp.Discord',
  'app/com.discordapp.DiscordCanary',
  'app/com.discordapp.DiscordPTB',
] as const;

/**
 * Lists Discord IPC socket or pipe paths for a platform, trying indexes 0
 * through 9.
 *
 * @param platform Node or Bun process.platform value.
 * @param env Process environment map.
 * @returns Candidate paths in connection order.
 */
export function discordIpcSocketPaths(platform: string, env: Record<string, string | undefined> = {}): string[] {
  if (platform === 'win32') return discordIpcWindowsPipePaths();
  return discordIpcUnixSocketPaths(discordIpcUnixDirectories(env));
}

/**
 * Lists Windows named-pipe paths for Discord IPC.
 *
 * @returns Pipe paths for indexes 0 through 9.
 */
export function discordIpcWindowsPipePaths(): string[] {
  return discordIpcSocketIndexes().map((index) => '\\\\.\\pipe\\discord-ipc-' + String(index));
}

/**
 * Lists unique Unix directories that may contain Discord IPC sockets.
 *
 * @param env Process environment map.
 * @returns Directory paths, always including /tmp.
 */
export function discordIpcUnixDirectories(env: Record<string, string | undefined>): string[] {
  const directories: string[] = [];
  for (const name of DISCORD_IPC_UNIX_DIRECTORY_VARIABLES) {
    discordIpcDirectoryAppend(directories, env[name]);
  }
  discordIpcDirectoryAppend(directories, '/tmp');
  return directories;
}

/**
 * Lists Unix socket paths under the given directories, including snap and
 * Flatpak subpaths, for indexes 0 through 9.
 *
 * @param directories Runtime and temp directories to search.
 * @returns Socket paths in connection order.
 */
export function discordIpcUnixSocketPaths(directories: readonly string[]): string[] {
  const paths: string[] = [];
  for (const index of discordIpcSocketIndexes()) {
    for (const directory of directories) {
      for (const subdirectory of DISCORD_IPC_UNIX_SUBDIRECTORIES) {
        paths.push(discordIpcUnixSocketPath(directory, subdirectory, index));
      }
    }
  }
  return paths;
}

/**
 * Builds one Unix Discord IPC socket path.
 *
 * @param directory Runtime or temp directory.
 * @param subdirectory Snap or Flatpak subdirectory, or an empty string.
 * @param index Socket index from 0 through 9.
 * @returns Socket path.
 */
export function discordIpcUnixSocketPath(directory: string, subdirectory: string, index: number): string {
  const folder = subdirectory === '' ? directory : join(directory, subdirectory);
  return join(folder, `discord-ipc-${index}`);
}

/**
 * Returns the Discord IPC socket indexes that should be tried.
 *
 * @returns Integers from 0 through the inclusive maximum.
 */
export function discordIpcSocketIndexes(): number[] {
  const indexes: number[] = [];
  for (let index = 0; index <= DISCORD_IPC_SOCKET_INDEX_MAXIMUM; index += 1) {
    indexes.push(index);
  }
  return indexes;
}

/**
 * Appends a non-empty unique directory to a list.
 *
 * @param directories Collected directories.
 * @param candidate Raw directory path, or undefined.
 */
function discordIpcDirectoryAppend(directories: string[], candidate: string | undefined): void {
  const trimmed = candidate?.trim() ?? '';
  if (trimmed === '' || directories.includes(trimmed)) return;
  directories.push(trimmed);
}
