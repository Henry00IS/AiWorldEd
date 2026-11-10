import { describe, expect, it, vi } from 'vitest';
import {
  WINDOWS_UPDATE_BLOCKED_MESSAGE,
  windowsUpdateApplyLaunch,
  type WindowsUpdateApplyLaunchSystem,
} from '@/updater/windows_update_apply_launch.js';

const LAUNCH = {
  taskName: 'AiWorldEdUpdate_1',
  scriptPath: 'C:\\data\\update.ps1',
  startedPath: 'C:\\data\\update.started',
};

/**
 * Builds a fake system whose script writes its started marker after a delay.
 *
 * @param startsAfterMs Milliseconds until the marker appears, or null for a
 *   script that Windows blocks.
 * @returns Fake system, its clock and its records.
 */
function systemCreate(startsAfterMs: number | null) {
  let clockMs = 0;
  let taskRunAtMs: number | null = null;
  const removed: string[] = [];
  const system: WindowsUpdateApplyLaunchSystem = {
    taskRun: vi.fn(() => {
      taskRunAtMs = clockMs;
    }),
    taskDelete: vi.fn(),
    fileExists: (path) =>
      path === LAUNCH.startedPath &&
      taskRunAtMs !== null &&
      startsAfterMs !== null &&
      clockMs - taskRunAtMs >= startsAfterMs,
    fileRemove: (path) => removed.push(path),
    wait: async (milliseconds) => {
      clockMs += milliseconds;
    },
  };
  return { system, removed, clock: () => clockMs };
}

describe('windowsUpdateApplyLaunch', () => {
  it('returns once the script reports it started, so the app may quit', async () => {
    const { system, removed, clock } = systemCreate(1500);

    await windowsUpdateApplyLaunch(LAUNCH, system);

    expect(system.taskRun).toHaveBeenCalledWith(LAUNCH.taskName, LAUNCH.scriptPath);
    expect(clock()).toBeGreaterThanOrEqual(1500);
    expect(clock()).toBeLessThan(2000);
    expect(system.taskDelete).not.toHaveBeenCalled();
    expect(removed).toEqual([LAUNCH.startedPath]);
  });

  it('gives up after about 10 s when Windows blocks the script, deletes the task and says so', async () => {
    const { system, removed, clock } = systemCreate(null);

    await expect(windowsUpdateApplyLaunch(LAUNCH, system)).rejects.toThrow(WINDOWS_UPDATE_BLOCKED_MESSAGE);

    expect(clock()).toBeGreaterThanOrEqual(10000);
    expect(clock()).toBeLessThan(11000);
    expect(system.taskDelete).toHaveBeenCalledWith(LAUNCH.taskName);
    expect(removed).toEqual([LAUNCH.startedPath, LAUNCH.scriptPath]);
  });

  it('points to the releases page when the script is blocked', () => {
    expect(WINDOWS_UPDATE_BLOCKED_MESSAGE).toMatch(/Windows blocked the update/);
    expect(WINDOWS_UPDATE_BLOCKED_MESSAGE).toMatch(/releases page/);
  });
});
