import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Native window that exposes its GTK window pointer. */
export type LinuxIconWindow = {
  readonly ptr: unknown;
};

/** Native library and icon file the running Linux app uses. */
export type LinuxWindowIconTarget = {
  libraryPath: string;
  iconPath: string;
};

/** Minimal bun:ffi surface used to call the native icon setter. */
interface BunFfiModule {
  dlopen: (
    path: string,
    symbols: Record<string, { args: unknown[]; returns: unknown }>,
  ) => { symbols: Record<string, ((...args: never[]) => unknown) | undefined> };
  FFIType: { ptr: unknown; cstring: unknown; void: unknown };
  ptr: (value: Uint8Array) => unknown;
}

/**
 * Sets the app icon on the editor window, which Linux shows in the title bar,
 * the taskbar and the window switcher. The native GTK window gets no icon on
 * its own, so this hands it the 192 px icon packaged with the editor view. The
 * 512 px Resources/appIcon.png stays for desktop entries: it is too large for
 * the X11 window icon list, so taskbars would not show it.
 *
 * @param desktopWindow Shown editor window.
 * @returns Promise that settles after the best-effort icon apply finishes.
 */
export async function applyLinuxWindowIcon(desktopWindow: LinuxIconWindow): Promise<void> {
  if (process.platform !== 'linux') return;
  const target = linuxWindowIconTarget(process.execPath);
  const windowPointer = desktopWindow.ptr;
  if (!target || !windowPointer) return;
  try {
    const ffi = await loadBunFfiModule();
    const { symbols } = ffi.dlopen(target.libraryPath, {
      setWindowIcon: { args: [ffi.FFIType.ptr, ffi.FFIType.cstring], returns: ffi.FFIType.void },
    });
    const iconPathBytes = new TextEncoder().encode(`${target.iconPath}\0`);
    symbols['setWindowIcon']?.(windowPointer as never, ffi.ptr(iconPathBytes) as never);
  } catch {
    return;
  }
}

/**
 * Finds the native library and icon next to the running Bun executable.
 *
 * @param executablePath Path of the running Bun executable (in the bin folder).
 * @returns Library and icon paths, or null when the package has no icon.
 */
export function linuxWindowIconTarget(executablePath: string): LinuxWindowIconTarget | null {
  const binDirectory = dirname(executablePath);
  const iconPath = linuxWindowIconPathResolve(binDirectory);
  if (!iconPath) return null;
  return { libraryPath: join(binDirectory, 'libNativeWrapper.so'), iconPath };
}

/**
 * Resolves the 192 px icon copied into the editor view (build.copy).
 *
 * @param binDirectory Folder of the app's Bun executable.
 * @returns Absolute icon path, or null when no packaged icon is present.
 */
export function linuxWindowIconPathResolve(binDirectory: string): string | null {
  const iconPath = resolve(binDirectory, '../Resources/app/views/main_ui/android-chrome-192x192.png');
  return existsSync(iconPath) ? iconPath : null;
}

/**
 * Loads bun:ffi only inside the Bun process.
 *
 * @returns The bun:ffi module.
 */
async function loadBunFfiModule(): Promise<BunFfiModule> {
  const moduleName = ['bun', 'ffi'].join(':');
  return import(/* @vite-ignore */ moduleName) as Promise<BunFfiModule>;
}
