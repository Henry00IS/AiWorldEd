/**
 * Starts the Windows apply step and confirms it really runs before the app
 * quits. Remove with the rest of the Windows apply step when moving to
 * Electrobun 2.x.
 */

/** How long to wait for the apply script's started marker. */
export const WINDOWS_UPDATE_START_TIMEOUT_MS = 10000;

/** How often to look for the marker. */
const WINDOWS_UPDATE_START_POLL_MS = 200;

/** Shown when Windows does not run the apply script, for example by policy. */
export const WINDOWS_UPDATE_BLOCKED_MESSAGE =
  'Windows blocked the update script, so the app was not updated. Download the installer from the releases page instead.';

/** The apply script's scheduled task, script file and started marker. */
export interface WindowsUpdateApplyLaunchFiles {
  taskName: string;
  scriptPath: string;
  startedPath: string;
}

/** System calls the launch uses, so tests can fake them. */
export interface WindowsUpdateApplyLaunchSystem {
  /** Creates and starts the scheduled task; throws when Windows refuses. */
  taskRun: (taskName: string, scriptPath: string) => void;
  /** Deletes the scheduled task, ignoring failures. */
  taskDelete: (taskName: string) => void;
  fileExists: (path: string) => boolean;
  /** Removes a file, ignoring a missing one. */
  fileRemove: (path: string) => void;
  wait: (milliseconds: number) => Promise<void>;
}

/**
 * Starts the apply script and waits until it writes its started marker. When no
 * marker appears in time, the script was blocked (Group Policy execution
 * policy, AppLocker, Constrained Language Mode): the task and script are
 * removed and the app must not quit.
 *
 * @param files Task name, script path and marker path.
 * @param system System calls.
 * @throws Error with WINDOWS_UPDATE_BLOCKED_MESSAGE when the script never
 *   started.
 */
export async function windowsUpdateApplyLaunch(
  files: WindowsUpdateApplyLaunchFiles,
  system: WindowsUpdateApplyLaunchSystem,
): Promise<void> {
  system.fileRemove(files.startedPath);
  system.taskRun(files.taskName, files.scriptPath);
  if (await windowsUpdateApplyStartedWait(files.startedPath, system)) return;
  system.taskDelete(files.taskName);
  system.fileRemove(files.scriptPath);
  throw new Error(WINDOWS_UPDATE_BLOCKED_MESSAGE);
}

/**
 * Polls for the started marker until it appears or the time limit passes.
 *
 * @param startedPath Marker path.
 * @param system System calls.
 * @returns True when the marker appeared in time.
 */
async function windowsUpdateApplyStartedWait(
  startedPath: string,
  system: WindowsUpdateApplyLaunchSystem,
): Promise<boolean> {
  for (let waitedMs = 0; waitedMs < WINDOWS_UPDATE_START_TIMEOUT_MS; waitedMs += WINDOWS_UPDATE_START_POLL_MS) {
    if (system.fileExists(startedPath)) return true;
    await system.wait(WINDOWS_UPDATE_START_POLL_MS);
  }
  return system.fileExists(startedPath);
}
