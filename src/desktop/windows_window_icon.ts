import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPLICATION_DISPLAY_NAME } from '@/application_identity.js';

/** Minimal bun:ffi surface used for Win32 title-bar icon APIs. */
interface BunFfiModule {
  dlopen: (
    path: string,
    symbols: Record<string, { args: unknown[]; returns: unknown }>,
  ) => {
    symbols: Record<string, ((...args: never[]) => unknown) | undefined>;
  };
  FFIType: {
    ptr: unknown;
    i32: unknown;
    u32: unknown;
    u64: unknown;
    function: unknown;
  };
  ptr: (value: Uint8Array | Buffer) => unknown;
  JSCallback: new (
    callback: (...args: never[]) => unknown,
    definition: { args: unknown[]; returns: unknown },
  ) => { ptr: unknown; close: () => void };
}

/** Win32 LoadImage type for icons. */
const IMAGE_ICON = 1;
/** Win32 LoadImage flag: load from a file path. */
const LR_LOADFROMFILE = 0x0010;
/** Win32 message that assigns an icon to a top-level window. */
const WM_SETICON = 0x0080;
/** Small title-bar icon slot. */
const ICON_SMALL = 0;
/** Large Alt-Tab / task-switcher icon slot. */
const ICON_BIG = 1;
/** Max title characters read while enumerating top-level windows. */
const WINDOW_TITLE_CAPACITY = 512;

/**
 * Applies the packaged Windows app icon to the visible editor window.
 *
 * PE icons alone do not update the HWND title-bar glyph. This loads the
 * packaged `.ico` and posts WM_SETICON after the window is shown.
 *
 * @param windowTitle Preferred native window title text from BrowserWindow.
 * @returns Promise that settles after the best-effort icon apply finishes.
 */
export async function applyWindowsWindowIcon(windowTitle: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const iconPath = resolvePackagedWindowsIconPath();
  if (!iconPath) return;
  try {
    await setWindowIconFromFile(windowTitle, iconPath);
  } catch {
    return;
  }
}

/**
 * Resolves the Windows `.ico` Electrobun copies into Resources for packaging.
 *
 * @param processWorkingDirectory Process cwd (Electrobun bin folder when
 *   installed).
 * @returns Absolute icon path, or null when no packaged icon is present.
 */
export function resolvePackagedWindowsIconPath(processWorkingDirectory: string = process.cwd()): string | null {
  const candidates = [
    resolve(processWorkingDirectory, '../Resources/app/views/main_ui/app_icon.ico'),
    resolve(processWorkingDirectory, '../Resources/app.ico'),
    resolve(processWorkingDirectory, 'Resources/app.ico'),
    resolve(processWorkingDirectory, '../Resources/app_icon.ico'),
  ];
  return candidates.find((candidatePath) => existsSync(candidatePath)) ?? null;
}

/**
 * Finds the editor HWND and assigns small/large icons from an `.ico` file.
 *
 * @param windowTitle Preferred exact title from BrowserWindow construction.
 * @param iconPath Absolute path to a multi-size `.ico` file.
 */
async function setWindowIconFromFile(windowTitle: string, iconPath: string): Promise<void> {
  const ffi = await loadBunFfiModule();
  const user32 = openUser32(ffi);
  const windowHandle = findEditorWindowHandle(ffi, user32, windowTitle);
  if (!windowHandle) return;
  assignLoadedIcons(ffi, user32, windowHandle, iconPath);
}

/** Bound user32 symbols required for title-bar icon assignment. */
interface User32IconsApi {
  FindWindowW: ((...args: never[]) => unknown) | undefined;
  EnumWindows: ((...args: never[]) => unknown) | undefined;
  GetWindowTextW: ((...args: never[]) => unknown) | undefined;
  LoadImageW: ((...args: never[]) => unknown) | undefined;
  SendMessageW: ((...args: never[]) => unknown) | undefined;
}

/**
 * Opens user32 exports used for window lookup and icon assignment.
 *
 * @param ffi Bun FFI module.
 * @returns Bound user32 symbols.
 */
function openUser32(ffi: BunFfiModule): User32IconsApi {
  const symbols = ffi.dlopen('user32.dll', {
    FindWindowW: { args: [ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.ptr },
    EnumWindows: { args: [ffi.FFIType.function, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
    GetWindowTextW: { args: [ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.i32], returns: ffi.FFIType.i32 },
    LoadImageW: {
      args: [ffi.FFIType.ptr, ffi.FFIType.ptr, ffi.FFIType.u32, ffi.FFIType.i32, ffi.FFIType.i32, ffi.FFIType.u32],
      returns: ffi.FFIType.ptr,
    },
    SendMessageW: {
      args: [ffi.FFIType.ptr, ffi.FFIType.u32, ffi.FFIType.u64, ffi.FFIType.ptr],
      returns: ffi.FFIType.ptr,
    },
  }).symbols;
  return {
    FindWindowW: symbols['FindWindowW'],
    EnumWindows: symbols['EnumWindows'],
    GetWindowTextW: symbols['GetWindowTextW'],
    LoadImageW: symbols['LoadImageW'],
    SendMessageW: symbols['SendMessageW'],
  };
}

/**
 * Finds the editor window by exact title, then by display-name prefix.
 *
 * @param ffi Bun FFI helpers.
 * @param user32 Bound user32 API.
 * @param windowTitle Preferred exact title.
 * @returns HWND pointer or null.
 */
function findEditorWindowHandle(ffi: BunFfiModule, user32: User32IconsApi, windowTitle: string): unknown {
  const exactHandle = findWindowByExactTitle(ffi, user32, windowTitle);
  if (exactHandle) return exactHandle;
  if (windowTitle !== APPLICATION_DISPLAY_NAME) {
    const displayNameHandle = findWindowByExactTitle(ffi, user32, APPLICATION_DISPLAY_NAME);
    if (displayNameHandle) return displayNameHandle;
  }
  return findWindowByTitlePrefix(ffi, user32, APPLICATION_DISPLAY_NAME);
}

/**
 * Finds a top-level window with an exact title string.
 *
 * @param ffi Bun FFI helpers.
 * @param user32 Bound user32 API.
 * @param title Exact window title.
 * @returns HWND pointer or null.
 */
function findWindowByExactTitle(ffi: BunFfiModule, user32: User32IconsApi, title: string): unknown {
  if (!user32.FindWindowW || title.length === 0) return null;
  const titleBuffer = encodeWideNullTerminated(title);
  retainNativeStringBuffer(titleBuffer);
  return user32.FindWindowW(0 as never, ffi.ptr(titleBuffer) as never) || null;
}

/**
 * Enumerates top-level windows and returns the first title with a prefix match.
 *
 * @param ffi Bun FFI helpers.
 * @param user32 Bound user32 API.
 * @param titlePrefix Title prefix such as the application display name.
 * @returns HWND pointer or null.
 */
function findWindowByTitlePrefix(ffi: BunFfiModule, user32: User32IconsApi, titlePrefix: string): unknown {
  if (!user32.EnumWindows || !user32.GetWindowTextW || titlePrefix.length === 0) return null;
  let matchedHandle: unknown = null;
  const titleBuffer = Buffer.alloc(WINDOW_TITLE_CAPACITY * 2);
  retainNativeStringBuffer(titleBuffer);
  const enumCallback = new ffi.JSCallback(
    createTitlePrefixEnumHandler(ffi, user32, titlePrefix, titleBuffer, (handle) => {
      matchedHandle = handle;
    }),
    { args: [ffi.FFIType.ptr, ffi.FFIType.ptr], returns: ffi.FFIType.i32 },
  );
  try {
    user32.EnumWindows(enumCallback.ptr as never, 0 as never);
  } finally {
    enumCallback.close();
  }
  return matchedHandle;
}

/**
 * Builds the EnumWindows callback that matches titles by prefix.
 *
 * @param ffi Bun FFI helpers.
 * @param user32 Bound user32 API.
 * @param titlePrefix Title prefix to match.
 * @param titleBuffer Reused UTF-16 title buffer.
 * @param onMatch Invoked with the first matching HWND.
 * @returns EnumWindows proc returning 0 to stop or 1 to continue.
 */
function createTitlePrefixEnumHandler(
  ffi: BunFfiModule,
  user32: User32IconsApi,
  titlePrefix: string,
  titleBuffer: Buffer,
  onMatch: (windowHandle: unknown) => void,
): (...args: never[]) => unknown {
  return ((windowHandle: unknown) => {
    titleBuffer.fill(0);
    const length = Number(
      user32.GetWindowTextW?.(windowHandle as never, ffi.ptr(titleBuffer) as never, WINDOW_TITLE_CAPACITY as never) ??
        0,
    );
    if (length <= 0) return 1;
    const title = titleBuffer.toString('utf16le', 0, length * 2);
    if (!title.startsWith(titlePrefix)) return 1;
    onMatch(windowHandle);
    return 0;
  }) as (...args: never[]) => unknown;
}

/**
 * Loads small and large icons from disk and posts WM_SETICON for both slots.
 *
 * @param ffi Bun FFI helpers.
 * @param user32 Bound user32 API.
 * @param windowHandle Target HWND.
 * @param iconPath Absolute `.ico` path.
 */
function assignLoadedIcons(ffi: BunFfiModule, user32: User32IconsApi, windowHandle: unknown, iconPath: string): void {
  if (!user32.LoadImageW || !user32.SendMessageW) return;
  const iconPathBuffer = encodeWideNullTerminated(iconPath);
  retainNativeStringBuffer(iconPathBuffer);
  const iconPathPointer = ffi.ptr(iconPathBuffer);
  const smallIcon = user32.LoadImageW(
    0 as never,
    iconPathPointer as never,
    IMAGE_ICON as never,
    16 as never,
    16 as never,
    LR_LOADFROMFILE as never,
  );
  const largeIcon = user32.LoadImageW(
    0 as never,
    iconPathPointer as never,
    IMAGE_ICON as never,
    32 as never,
    32 as never,
    LR_LOADFROMFILE as never,
  );
  if (smallIcon) {
    user32.SendMessageW(windowHandle as never, WM_SETICON as never, BigInt(ICON_SMALL) as never, smallIcon as never);
  }
  if (largeIcon) {
    user32.SendMessageW(windowHandle as never, WM_SETICON as never, BigInt(ICON_BIG) as never, largeIcon as never);
  }
}

/**
 * Encodes a JS string as a null-terminated UTF-16LE buffer for Win32 wide APIs.
 *
 * @param value Text to encode.
 * @returns Buffer containing UTF-16LE characters plus a trailing null wchar.
 */
export function encodeWideNullTerminated(value: string): Buffer {
  return Buffer.from(`${value}\0`, 'utf16le');
}

/** Keeps FFI string buffers alive across the native call boundary. */
const retainedNativeStringBuffers: Buffer[] = [];

/**
 * Pins a buffer so Bun does not collect it before Win32 reads the path/title.
 *
 * @param buffer Null-terminated wide string buffer.
 */
function retainNativeStringBuffer(buffer: Buffer): void {
  retainedNativeStringBuffers.push(buffer);
  if (retainedNativeStringBuffers.length > 16) retainedNativeStringBuffers.shift();
}

/**
 * Dynamically loads bun:ffi without a static specifier Vite can fail to
 * resolve.
 *
 * @returns The bun:ffi module namespace.
 */
async function loadBunFfiModule(): Promise<BunFfiModule> {
  const moduleName = ['bun', 'ffi'].join(':');
  return import(/* @vite-ignore */ moduleName) as Promise<BunFfiModule>;
}
