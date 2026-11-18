import { describe, expect, it } from 'vitest';
import {
  discordIpcSocketIndexes,
  discordIpcSocketPaths,
  discordIpcUnixDirectories,
  discordIpcUnixSocketPath,
  discordIpcWindowsPipePaths,
} from '@/desktop/discord/discord_ipc_paths.js';

describe('discord_ipc_paths', () => {
  it('lists Windows named pipes for indexes 0 through 9', () => {
    const paths = discordIpcWindowsPipePaths();
    expect(discordIpcSocketIndexes()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paths).toHaveLength(10);
    expect(paths[0]).toBe('\\\\.\\pipe\\discord-ipc-0');
    expect(paths[9]).toBe('\\\\.\\pipe\\discord-ipc-9');
    expect(discordIpcSocketPaths('win32', {})).toEqual(paths);
  });

  it('searches runtime, temp, and /tmp directories plus snap and Flatpak subpaths on Unix', () => {
    const directories = discordIpcUnixDirectories({
      XDG_RUNTIME_DIR: '/run/user/1000',
      TMPDIR: '/var/tmp',
      TMP: '',
      TEMP: '/var/tmp',
    });
    expect(directories).toEqual(['/run/user/1000', '/var/tmp', '/tmp']);
    const paths = discordIpcSocketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' });
    expect(paths[0]).toBe(discordIpcUnixSocketPath('/run/user/1000', '', 0));
    expect(paths).toContain(discordIpcUnixSocketPath('/run/user/1000', 'snap.discord', 0));
    expect(paths).toContain(discordIpcUnixSocketPath('/run/user/1000', 'app/com.discordapp.Discord', 3));
    expect(paths).toContain(discordIpcUnixSocketPath('/tmp', 'app/com.discordapp.DiscordCanary', 9));
    expect(paths).toContain(discordIpcUnixSocketPath('/tmp', 'app/com.discordapp.DiscordPTB', 1));
    expect(paths.filter((path) => path.endsWith('discord-ipc-0'))).toHaveLength(directoriesForOneEnv().length * 5);
  });
});

/**
 * Returns the unique Unix directories used when only XDG_RUNTIME_DIR is set.
 *
 * @returns Runtime directory and /tmp.
 */
function directoriesForOneEnv(): string[] {
  return discordIpcUnixDirectories({ XDG_RUNTIME_DIR: '/run/user/1000' });
}
