import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { windowsUpdateApplyScriptBuild } from '@/updater/windows_update_apply_script.js';
import {
  windowsUpdateApplyLaunch,
  type WindowsUpdateApplyLaunchSystem,
} from '@/updater/windows_update_apply_launch.js';

/**
 * Installs a downloaded Electrobun 1.x update on Windows with our own apply
 * step instead of Electrobun's update.bat. Remove this file and its caller when
 * moving to Electrobun 2.x.
 */

/** Seconds the apply step waits for the app to close and release its files. */
const WINDOWS_UPDATE_WAIT_SECONDS_MAXIMUM = 90;

/** What the Windows apply step needs from Electrobun's public updater API. */
export interface WindowsUpdateApplyOptions {
  /** Updater.appDataFolder(): holds the installed `app` folder and downloads. */
  appDataFolder: string;
  /** Updater.getLocalInfo().name: app folder name inside the bundle. */
  appName: string;
  /** Hash of the downloaded bundle. */
  hash: string;
  /** Our own process id. */
  appProcessId: number;
  /** Quits the app so the apply step can replace it. */
  quit: () => void;
}

/** Real system calls of the launch: schtasks and the file system. */
const WINDOWS_UPDATE_APPLY_SYSTEM: WindowsUpdateApplyLaunchSystem = {
  taskRun: windowsUpdateTaskRun,
  taskDelete: (taskName) => void Bun.spawnSync(['schtasks', '/delete', '/tn', taskName, '/f']),
  fileExists: (path) => existsSync(path),
  fileRemove: (path) => rmSync(path, { force: true }),
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/**
 * Extracts the downloaded bundle, starts the apply step and quits once the step
 * reports that it runs.
 *
 * @param options App data folder, app name, bundle hash, process id and quit.
 * @throws Error when the bundle lacks the app, Windows refuses the task, or
 *   Windows blocked the script (the app then keeps running).
 */
export async function windowsUpdateApply(options: WindowsUpdateApplyOptions): Promise<void> {
  const stagingFolder = await windowsUpdateBundleExtract(options.appDataFolder, options.hash);
  const newAppFolder = join(stagingFolder, options.appName);
  if (!existsSync(newAppFolder)) throw new Error("The downloaded update doesn't contain the app. Try again.");
  const taskName = `${options.appName.replace(/[^A-Za-z0-9]/g, '')}Update_${Date.now()}`;
  const scriptPath = await windowsUpdateScriptWrite(options, stagingFolder, newAppFolder, taskName);
  const startedPath = windowsUpdateStartedPath(options.appDataFolder);
  await windowsUpdateApplyLaunch({ taskName, scriptPath, startedPath }, WINDOWS_UPDATE_APPLY_SYSTEM);
  options.quit();
}

/**
 * Writes the apply script next to the installed app, with a byte order mark so
 * Windows PowerShell reads non-ASCII paths correctly.
 *
 * @param options App data folder and process id.
 * @param stagingFolder Folder holding the extracted bundle.
 * @param newAppFolder Extracted new app folder.
 * @param taskName Scheduled task that runs the script.
 * @returns Path of the written script.
 */
async function windowsUpdateScriptWrite(
  options: WindowsUpdateApplyOptions,
  stagingFolder: string,
  newAppFolder: string,
  taskName: string,
): Promise<string> {
  const appFolder = join(options.appDataFolder, 'app');
  const script = windowsUpdateApplyScriptBuild({
    appProcessId: options.appProcessId,
    appFolder,
    newAppFolder,
    stagingFolder,
    launcherPath: join(appFolder, 'bin', 'launcher.exe'),
    taskName,
    logPath: join(options.appDataFolder, 'update.log'),
    startedPath: windowsUpdateStartedPath(options.appDataFolder),
    waitSecondsMaximum: WINDOWS_UPDATE_WAIT_SECONDS_MAXIMUM,
  });
  const scriptPath = join(options.appDataFolder, 'update.ps1');
  await Bun.write(scriptPath, `\uFEFF${script}`);
  return scriptPath;
}

/**
 * Returns where the apply script reports that it started.
 *
 * @param appDataFolder Electrobun app data folder.
 * @returns Marker path next to update.log.
 */
function windowsUpdateStartedPath(appDataFolder: string): string {
  return join(appDataFolder, 'update.started');
}

/**
 * Extracts the bundle's tar into a fresh staging folder next to it.
 *
 * @param appDataFolder Electrobun app data folder.
 * @param hash Hash of the downloaded bundle.
 * @returns Staging folder holding the extracted bundle.
 */
async function windowsUpdateBundleExtract(appDataFolder: string, hash: string): Promise<string> {
  const extractionFolder = join(appDataFolder, 'self-extraction');
  const stagingFolder = join(extractionFolder, `temp-${hash}`);
  rmSync(stagingFolder, { recursive: true, force: true });
  mkdirSync(stagingFolder, { recursive: true });
  const bundleBytes = await Bun.file(join(extractionFolder, `${hash}.tar`)).arrayBuffer();
  await new Bun.Archive(bundleBytes).extract(stagingFolder);
  return stagingFolder;
}

/**
 * Runs the apply script through a one-off scheduled task, so it outlives the
 * app, with PowerShell's window hidden.
 *
 * @param taskName Name of the scheduled task.
 * @param scriptPath Path of the apply script.
 * @throws Error when Windows refuses to create or start the task.
 */
function windowsUpdateTaskRun(taskName: string, scriptPath: string): void {
  const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`;
  const created = Bun.spawnSync([
    'schtasks',
    '/create',
    '/tn',
    taskName,
    '/tr',
    command,
    '/sc',
    'once',
    '/st',
    '00:00',
    '/f',
  ]);
  const started = created.success && Bun.spawnSync(['schtasks', '/run', '/tn', taskName]).success;
  if (!started) throw new Error("Windows didn't start the update. Try again.");
}
