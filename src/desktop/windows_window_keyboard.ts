/** Windows virtual-key code of F11. */
export const WINDOWS_VIRTUAL_KEY_F11 = 0x7a;

/** Key press the native window reports while it holds keyboard focus itself. */
export type WindowKeyEvent = {
  data: { keyCode: number; modifiers: number; isRepeat: boolean };
};

/** Native window operations used to route keyboard input. */
export type KeyboardDesktopWindow = {
  activate(): unknown;
  on(name: 'focus' | 'blur' | 'keyDown', handler: (event: unknown) => void): unknown;
};

/** Platform and fullscreen action for the keyboard routing. */
export type WindowsWindowKeyboardOptions = {
  platform: NodeJS.Platform;
  fullscreenToggle: () => unknown;
};

/**
 * Keeps the keyboard working when the Windows window itself holds the focus
 * instead of the editor page, as after clicking the title bar or switching back
 * to the app. Each activation hands the focus back to the page, and F11 that
 * still reaches the window toggles fullscreen. Linux and macOS give the page
 * the focus on their own.
 *
 * @param desktopWindow Editor window.
 * @param options Platform and fullscreen toggle.
 */
export function windowsWindowKeyboardInstall(
  desktopWindow: KeyboardDesktopWindow,
  options: WindowsWindowKeyboardOptions,
): void {
  if (options.platform !== 'win32') return;
  // activate() itself can report focus again; answer once per activation.
  let pageFocusedSinceActivation = false;
  desktopWindow.on('blur', () => {
    pageFocusedSinceActivation = false;
  });
  desktopWindow.on('focus', () => {
    if (pageFocusedSinceActivation) return;
    pageFocusedSinceActivation = true;
    desktopWindow.activate();
  });
  desktopWindow.on('keyDown', (event) => {
    const { keyCode, modifiers, isRepeat } = (event as WindowKeyEvent).data;
    if (keyCode === WINDOWS_VIRTUAL_KEY_F11 && modifiers === 0 && !isRepeat) options.fullscreenToggle();
  });
}
