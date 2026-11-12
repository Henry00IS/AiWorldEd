import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  windowsUpdateApplyScriptBuild,
  windowsUpdatePowerShellLiteral,
  type WindowsUpdateApplyScriptSettings,
} from '@/updater/windows_update_apply_script.js';

/**
 * PowerShell runs of the script are opt-in (set AIWORLDED_PWSH to a pwsh path);
 * CI only checks the script text.
 */
const POWERSHELL = process.env['AIWORLDED_PWSH'] ?? '';
const POWERSHELL_AVAILABLE =
  POWERSHELL !== '' && spawnSync(POWERSHELL, ['-NoProfile', '-Command', 'exit 0']).status === 0;

describe('windowsUpdateApplyScriptBuild', () => {
  it('waits only for our own process id, with a time limit, and never pauses', () => {
    const script = windowsUpdateApplyScriptBuild(scriptSettingsWindows());

    expect(script).toContain('$appProcessId = 4242');
    expect(script).toContain('Get-Process -Id $appProcessId');
    expect(script).toContain('.AddSeconds(90)');
    expect(script).not.toMatch(/tasklist|IMAGENAME|bun\.exe/i);
    expect(script).not.toMatch(/\bpause\b|Read-Host/i);
    expect(script).toContain("$launcherPath = 'C:\\Users\\Ann\\AppData\\Local\\app\\bin\\launcher.exe'");
    expect(script).toContain("$taskName = 'AiWorldEdUpdate_1'");
  });

  it('writes the started marker first, before anything that needs more than basic cmdlets', () => {
    const lines = windowsUpdateApplyScriptBuild(scriptSettingsWindows()).split('\r\n');

    expect(lines[0]).toBe("Set-Content -LiteralPath 'C:\\Users\\Ann\\AppData\\Local\\update.started' -Value 'started'");
  });

  it('quotes paths so apostrophes in user names stay part of the path', () => {
    expect(windowsUpdatePowerShellLiteral("C:\\Users\\O'Neil\\app")).toBe("'C:\\Users\\O''Neil\\app'");
    expect(windowsUpdateApplyScriptBuild({ ...scriptSettingsWindows(), appFolder: "C:\\O'Neil\\app" })).toContain(
      "$appFolder = 'C:\\O''Neil\\app'",
    );
  });
});

describe.skipIf(!POWERSHELL_AVAILABLE)('windows update apply script run by PowerShell', () => {
  let sandbox = '';
  let runningAppProcessId = 0;

  afterEach(() => {
    if (runningAppProcessId) spawnSync('kill', [String(runningAppProcessId)]);
    runningAppProcessId = 0;
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
  });

  it('waits for the app to exit, swaps in the new version, relaunches it and cleans up', async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'update-apply-'));
    const settings = appFoldersCreate(sandbox, { newAppPresent: true });
    runningAppProcessId = runningAppStart(1.5);
    const startedAt = Date.now();

    const exitCode = scriptRun(sandbox, { ...settings, appProcessId: runningAppProcessId });

    expect(exitCode).toBe(0);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1400);
    expect(readFileSync(join(settings.appFolder, 'version.txt'), 'utf8')).toBe('new');
    await launchedVersionExpect(sandbox, 'new');
    expect(existsSync(`${settings.appFolder}.old`)).toBe(false);
    expect(existsSync(settings.stagingFolder)).toBe(false);
    expect(existsSync(join(sandbox, 'update.ps1'))).toBe(false);
    expect(readFileSync(settings.logPath, 'utf8')).toContain('Update installed');
    expect(existsSync(settings.startedPath)).toBe(false);
  });

  it('keeps and relaunches the old version when the new one is missing', async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'update-apply-'));
    const settings = appFoldersCreate(sandbox, { newAppPresent: false });

    const exitCode = scriptRun(sandbox, settings);

    expect(exitCode).toBe(1);
    expect(readFileSync(join(settings.appFolder, 'version.txt'), 'utf8')).toBe('old');
    await launchedVersionExpect(sandbox, 'old');
    expect(readFileSync(settings.logPath, 'utf8')).toContain('Update failed');
  });

  it('gives up after the time limit without touching or relaunching an app that keeps running', () => {
    sandbox = mkdtempSync(join(tmpdir(), 'update-apply-'));
    const settings = appFoldersCreate(sandbox, { newAppPresent: true });
    runningAppProcessId = runningAppStart(30);

    const exitCode = scriptRun(sandbox, { ...settings, appProcessId: runningAppProcessId, waitSecondsMaximum: 1 });

    expect(exitCode).toBe(1);
    expect(readFileSync(join(settings.appFolder, 'version.txt'), 'utf8')).toBe('old');
    expect(existsSync(join(sandbox, 'launched.txt'))).toBe(false);
    expect(readFileSync(settings.logPath, 'utf8')).toContain('Timed out waiting for the app to close');
  }, 20000);
});

/**
 * Starts a stand-in for the running app that is not our child, so it is gone
 * from the process list as soon as it exits, like the app on Windows.
 *
 * @param seconds How long it runs.
 * @returns Its process id.
 */
function runningAppStart(seconds: number): number {
  const started = spawnSync('sh', ['-c', `sleep ${seconds} >/dev/null 2>&1 & echo $!`], { encoding: 'utf8' });
  return Number(started.stdout.trim());
}

/**
 * Builds settings with Windows-style paths.
 *
 * @returns Script settings.
 */
function scriptSettingsWindows(): WindowsUpdateApplyScriptSettings {
  const appData = 'C:\\Users\\Ann\\AppData\\Local';
  return {
    appProcessId: 4242,
    appFolder: `${appData}\\app`,
    newAppFolder: `${appData}\\self-extraction\\temp-h\\AiWorldEd`,
    stagingFolder: `${appData}\\self-extraction\\temp-h`,
    launcherPath: `${appData}\\app\\bin\\launcher.exe`,
    taskName: 'AiWorldEdUpdate_1',
    logPath: `${appData}\\update.log`,
    startedPath: `${appData}\\update.started`,
    waitSecondsMaximum: 90,
  };
}

/**
 * Creates an installed old app and, optionally, an extracted new one. Each
 * app's launcher records which version it is when started.
 *
 * @param sandbox Temporary folder.
 * @param layout Whether the new version is extracted.
 * @returns Script settings pointing into the sandbox.
 */
function appFoldersCreate(sandbox: string, layout: { newAppPresent: boolean }): WindowsUpdateApplyScriptSettings {
  const stagingFolder = join(sandbox, 'self-extraction', 'temp-hash');
  const settings: WindowsUpdateApplyScriptSettings = {
    appProcessId: 999999,
    appFolder: join(sandbox, 'app'),
    newAppFolder: join(stagingFolder, 'AiWorldEd'),
    stagingFolder,
    launcherPath: join(sandbox, 'app', 'bin', 'launcher'),
    taskName: 'AiWorldEdUpdate_test',
    logPath: join(sandbox, 'update.log'),
    startedPath: join(sandbox, 'update.started'),
    waitSecondsMaximum: 10,
  };
  appFolderCreate(settings.appFolder, 'old', sandbox);
  mkdirSync(stagingFolder, { recursive: true });
  if (layout.newAppPresent) appFolderCreate(settings.newAppFolder, 'new', sandbox);
  return settings;
}

/**
 * Creates one app folder with a version file and a recording launcher.
 *
 * @param folder App folder.
 * @param version Version text.
 * @param sandbox Folder that receives launched.txt.
 */
function appFolderCreate(folder: string, version: string, sandbox: string): void {
  mkdirSync(join(folder, 'bin'), { recursive: true });
  writeFileSync(join(folder, 'version.txt'), version);
  const launcherPath = join(folder, 'bin', 'launcher');
  writeFileSync(launcherPath, `#!/bin/sh\necho ${version} > "${join(sandbox, 'launched.txt')}"\n`);
  chmodSync(launcherPath, 0o755);
}

/**
 * Writes the script into the sandbox and runs it like the scheduled task.
 *
 * @param sandbox Temporary folder.
 * @param settings Script settings.
 * @returns Exit code of PowerShell.
 */
function scriptRun(sandbox: string, settings: WindowsUpdateApplyScriptSettings): number | null {
  const scriptPath = join(sandbox, 'update.ps1');
  writeFileSync(scriptPath, `\uFEFF${windowsUpdateApplyScriptBuild(settings)}`);
  return spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-File', scriptPath]).status;
}

/**
 * Waits briefly for the started launcher and checks which version it was.
 *
 * @param sandbox Temporary folder.
 * @param version Expected version.
 */
async function launchedVersionExpect(sandbox: string, version: string): Promise<void> {
  const launchedPath = join(sandbox, 'launched.txt');
  for (let attempt = 0; attempt < 40 && !existsSync(launchedPath); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(readFileSync(launchedPath, 'utf8').trim()).toBe(version);
}
