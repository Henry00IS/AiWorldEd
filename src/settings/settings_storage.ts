/**
 * Key-value storage abstraction used by settings persistence.
 * Allows tests to inject an in-memory backend instead of localStorage.
 */
export interface SettingsStorage {
  /**
   * Reads a stored string value.
   * @param key Storage key.
   * @returns Stored value or null when missing.
   */
  getItem(key: string): string | null;

  /**
   * Writes a string value.
   * @param key Storage key.
   * @param value Value to store.
   */
  setItem(key: string, value: string): void;

  /**
   * Removes a stored value.
   * @param key Storage key.
   */
  removeItem(key: string): void;

  /**
   * Lists all keys currently present in storage.
   * @returns Storage keys.
   */
  keys(): string[];
}

/**
 * In-memory settings storage for tests and headless use.
 */
export class MemorySettingsStorage implements SettingsStorage {
  private readonly values: Map<string, string>;

  /**
   * Creates an empty memory store.
   */
  constructor() {
    this.values = new Map();
  }

  /**
   * @inheritdoc
   */
  getItem(key: string): string | null {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }

  /**
   * @inheritdoc
   */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  /**
   * @inheritdoc
   */
  removeItem(key: string): void {
    this.values.delete(key);
  }

  /**
   * @inheritdoc
   */
  keys(): string[] {
    return Array.from(this.values.keys());
  }
}

/**
 * localStorage-backed settings storage for the browser editor.
 */
export class LocalSettingsStorage implements SettingsStorage {
  private readonly storage: Storage;

  /**
   * Creates a localStorage adapter.
   * @param storage Browser storage implementation (defaults to localStorage).
   */
  constructor(storage: Storage = window.localStorage) {
    this.storage = storage;
  }

  /**
   * @inheritdoc
   */
  getItem(key: string): string | null {
    return this.storage.getItem(key);
  }

  /**
   * @inheritdoc
   */
  setItem(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  /**
   * @inheritdoc
   */
  removeItem(key: string): void {
    this.storage.removeItem(key);
  }

  /**
   * @inheritdoc
   */
  keys(): string[] {
    const result: string[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (key !== null) {
        result.push(key);
      }
    }
    return result;
  }
}
