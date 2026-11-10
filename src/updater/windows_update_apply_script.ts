/**
 * Our own Windows apply step for Electrobun 1.x updates. Electrobun 1.18's
 * update.bat waits for every bun.exe and launcher.exe on the PC and pauses on
 * failure; this step waits only for our own process. Remove this file and its
 * caller when moving to Electrobun 2.x.
 */

/** Paths and ids the Windows apply script works with. */
export interface WindowsUpdateApplyScriptSettings {
  /** Process id of the running app, whose exit the script waits for. */
  appProcessId: number;
  /** Installed app folder that is replaced. */
  appFolder: string;
  /** Extracted new app folder that takes its place. */
  newAppFolder: string;
  /** Temporary extraction folder removed afterwards. */
  stagingFolder: string;
  /** Launcher started inside the app folder after the swap. */
  launcherPath: string;
  /** Scheduled task that runs the script, deleted afterwards. */
  taskName: string;
  /** Log file that records each run. */
  logPath: string;
  /**
   * Marker the script writes as its very first action, so the app can tell
   * Windows ran it before quitting; removed when the script ends.
   */
  startedPath: string;
  /** Seconds the script waits for the app and its locked files at most. */
  waitSecondsMaximum: number;
}

/**
 * Quotes text as a PowerShell single-quoted string literal.
 *
 * @param text Raw text.
 * @returns Literal that PowerShell reads back as the same text.
 */
export function windowsUpdatePowerShellLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Builds the PowerShell apply script: report that it started, wait for our
 * process, move the old app aside, move the new one in, relaunch, clean up. On
 * failure it restores the old app, relaunches it and exits; it never waits for
 * input.
 *
 * @param settings Paths, process id, task name and time limit.
 * @returns Script text.
 */
export function windowsUpdateApplyScriptBuild(settings: WindowsUpdateApplyScriptSettings): string {
  return [...windowsUpdateApplyScriptVariables(settings), ...WINDOWS_UPDATE_APPLY_SCRIPT_BODY].join('\r\n') + '\r\n';
}

/**
 * Builds the script's variable assignments.
 *
 * @param settings Paths, process id, task name and time limit.
 * @returns Script lines.
 */
function windowsUpdateApplyScriptVariables(settings: WindowsUpdateApplyScriptSettings): string[] {
  const literal = windowsUpdatePowerShellLiteral;
  return [
    `Set-Content -LiteralPath ${literal(settings.startedPath)} -Value 'started'`,
    `$ErrorActionPreference = 'Stop'`,
    `$appProcessId = ${Math.trunc(settings.appProcessId)}`,
    `$appFolder = ${literal(settings.appFolder)}`,
    `$oldAppFolder = ${literal(`${settings.appFolder}.old`)}`,
    `$newAppFolder = ${literal(settings.newAppFolder)}`,
    `$stagingFolder = ${literal(settings.stagingFolder)}`,
    `$launcherPath = ${literal(settings.launcherPath)}`,
    `$taskName = ${literal(settings.taskName)}`,
    `$logPath = ${literal(settings.logPath)}`,
    `$startedPath = ${literal(settings.startedPath)}`,
    `$deadline = (Get-Date).AddSeconds(${Math.trunc(settings.waitSecondsMaximum)})`,
  ];
}

const WINDOWS_UPDATE_APPLY_SCRIPT_BODY: readonly string[] = [
  `function Write-UpdateLog([string]$text) { Add-Content -LiteralPath $logPath -Value "$((Get-Date).ToString('o')) $text" -ErrorAction SilentlyContinue }`,
  `function Wait-UpdateStep([string]$what) { if ((Get-Date) -gt $deadline) { throw "Timed out waiting for $what" }; Start-Sleep -Milliseconds 250 }`,
  `function Start-UpdateApp { if (Test-Path -LiteralPath $launcherPath) { Start-Process -FilePath $launcherPath -WorkingDirectory (Split-Path -Parent $launcherPath) } }`,
  `$exitCode = 0`,
  `$appClosed = $false`,
  `try {`,
  `  Write-UpdateLog 'Update started'`,
  `  while (Get-Process -Id $appProcessId -ErrorAction SilentlyContinue) { Wait-UpdateStep 'the app to close' }`,
  `  $appClosed = $true`,
  `  if (-not (Test-Path -LiteralPath $newAppFolder)) { throw "The new version is missing at $newAppFolder" }`,
  `  if (Test-Path -LiteralPath $oldAppFolder) { Remove-Item -LiteralPath $oldAppFolder -Recurse -Force }`,
  `  while (Test-Path -LiteralPath $appFolder) {`,
  `    try { Move-Item -LiteralPath $appFolder -Destination $oldAppFolder } catch { Wait-UpdateStep 'the app files to be released' }`,
  `  }`,
  `  try { Move-Item -LiteralPath $newAppFolder -Destination $appFolder } catch { Move-Item -LiteralPath $oldAppFolder -Destination $appFolder; throw }`,
  `  Start-UpdateApp`,
  `  Write-UpdateLog 'Update installed'`,
  `  Remove-Item -LiteralPath $oldAppFolder -Recurse -Force -ErrorAction SilentlyContinue`,
  `} catch {`,
  `  $exitCode = 1`,
  `  Write-UpdateLog "Update failed: $($_.Exception.Message)"`,
  `  if ((Test-Path -LiteralPath $oldAppFolder) -and -not (Test-Path -LiteralPath $appFolder)) { Move-Item -LiteralPath $oldAppFolder -Destination $appFolder -ErrorAction SilentlyContinue }`,
  `  if ($appClosed) { Start-UpdateApp }`,
  `} finally {`,
  `  Remove-Item -LiteralPath $stagingFolder -Recurse -Force -ErrorAction SilentlyContinue`,
  `  Remove-Item -LiteralPath $startedPath -Force -ErrorAction SilentlyContinue`,
  `  try { & schtasks.exe /delete /tn $taskName /f *> $null } catch { }`,
  `  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue`,
  `}`,
  `exit $exitCode`,
];
