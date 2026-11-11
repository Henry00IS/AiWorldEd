/**
 * Type-only shim for `electrobun/bun` under strict checking. Runtime resolution
 * still uses the real package via Electrobun's bundler.
 */

/** Local app info returned by the Electrobun updater. */
export type ElectrobunLocalInfo = {
  version: string;
  hash: string;
  name: string;
};

/** Result of checking the Electrobun release channel. */
export type ElectrobunUpdateCheck = {
  version: string;
  hash: string;
  updateAvailable: boolean;
  error: string;
};

/** Update state kept by the Electrobun updater after a check. */
export type ElectrobunUpdateInfo = ElectrobunUpdateCheck & {
  updateReady: boolean;
};

/** One status entry emitted by the Electrobun updater. */
export type ElectrobunUpdateStatusEntry = {
  status: string;
  message: string;
  timestamp: number;
  details?: { progress?: number };
};

/** Window frame rectangle. */
export type ElectrobunWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Native display information used to size desktop windows. */
export type ElectrobunDisplay = {
  workArea: ElectrobunWindowFrame;
};

/** Browser window construction options. */
export type ElectrobunWindowOptions = {
  title?: string;
  url?: string;
  frame?: ElectrobunWindowFrame;
  hidden?: boolean;
  activate?: boolean;
  rpc?: unknown;
};

/** Configuration for defineRPC on the Bun side. */
export type DefineRpcConfig = {
  /** Optional request timeout in milliseconds. */
  maxRequestTime?: number;
  handlers: {
    requests?: Record<string, (...args: never[]) => unknown>;
    messages?: Record<string, unknown>;
  };
};

/** Bun-side browser view helpers. */
export class BrowserView {
  /**
   * Defines a typed RPC schema for bun-to-browser communication.
   *
   * @param _config Handler configuration for requests and messages.
   * @returns RPC instance attached to browser windows.
   */
  static defineRPC<TSchema>(_config: DefineRpcConfig): TSchema {
    return {} as TSchema;
  }

  /**
   * Subscribes to a browser-surface lifecycle event.
   *
   * @param _name Event name.
   * @param _handler Event callback.
   */
  on(_name: 'dom-ready', _handler: () => void): void {}
}

/** Native desktop window host. */
export class BrowserWindow {
  /** Browser surface hosted by this window. */
  readonly webview = new BrowserView();

  /** @param _options Window title, URL, frame, and RPC binding. */
  constructor(_options: ElectrobunWindowOptions) {}

  /** Expands the native window to the available desktop size. */
  maximize(): void {}

  /** Shows and activates the native window. */
  show(): void {}
}

/** Native screen information exposed by Electrobun. */
export const Screen = {
  /** @returns Primary display bounds and usable work area. */
  getPrimaryDisplay(): ElectrobunDisplay {
    return { workArea: { x: 0, y: 0, width: 800, height: 600 } };
  },
};

/** Electrobun built-in updater API. */
export const Updater = {
  /** @returns Local package version information. */
  async getLocalInfo(): Promise<ElectrobunLocalInfo> {
    return { version: '0.0.0', hash: '', name: '' };
  },

  /** @returns Channel update availability information. */
  async checkForUpdate(): Promise<ElectrobunUpdateCheck> {
    return { version: '0.0.0', hash: '', updateAvailable: false, error: '' };
  },

  /** @returns Update state after the last check and download. */
  updateInfo(): ElectrobunUpdateInfo {
    return { version: '0.0.0', hash: '', updateAvailable: false, updateReady: false, error: '' };
  },

  /** @returns Per-app, per-channel data folder that holds the installed app. */
  async appDataFolder(): Promise<string> {
    return '';
  },

  /** @param _callback Receives every updater status entry; null unsubscribes. */
  onStatusChange(_callback: ((entry: ElectrobunUpdateStatusEntry) => void) | null): void {},

  /** Downloads the available update package. */
  async downloadUpdate(): Promise<void> {},

  /** Applies a downloaded update and restarts. */
  async applyUpdate(): Promise<void> {},
};

/** Options of the native file dialog. */
export type ElectrobunFileDialogOptions = {
  startingFolder?: string;
  allowedFileTypes?: string;
  canChooseFiles?: boolean;
  canChooseDirectory?: boolean;
  allowsMultipleSelection?: boolean;
};

/** Electrobun native utilities. */
export const Utils = {
  /** Well-known folders. */
  paths: {
    /** @returns Per-app data folder. */
    get userData(): string {
      return '';
    },
  },

  /**
   * Opens the native file dialog.
   *
   * @param _options Dialog options.
   * @returns Picked paths (an empty string when cancelled).
   */
  async openFileDialog(_options: ElectrobunFileDialogOptions): Promise<string[]> {
    return [];
  },

  /** Closes every window and exits the app. */
  quit(): void {},
};

/** Loose string-keyed record of Electrobun application configuration. */
export type ElectrobunConfig = Record<string, unknown>;
