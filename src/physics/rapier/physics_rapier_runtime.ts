import RAPIER from '@dimforge/rapier3d-deterministic-compat';

/** The loaded Rapier module namespace (deterministic cross-platform build). */
export type PhysicsRapierModule = typeof RAPIER;

/**
 * Loads the Rapier WebAssembly physics module once and hands out the ready
 * module to synchronous callers.
 */
export class PhysicsRapierRuntime {
  private static loadedModule: PhysicsRapierModule | null = null;
  private static pendingLoad: Promise<PhysicsRapierModule> | null = null;

  /**
   * Starts loading the module when needed and resolves once it is ready.
   *
   * @returns The ready Rapier module.
   */
  static ensureLoaded(): Promise<PhysicsRapierModule> {
    if (PhysicsRapierRuntime.loadedModule) {
      return Promise.resolve(PhysicsRapierRuntime.loadedModule);
    }
    if (!PhysicsRapierRuntime.pendingLoad) {
      PhysicsRapierRuntime.pendingLoad = PhysicsRapierRuntime.loadOnce();
    }
    return PhysicsRapierRuntime.pendingLoad;
  }

  /**
   * Returns the module when it finished loading.
   *
   * @returns The Rapier module, or null while still loading.
   */
  static getLoaded(): PhysicsRapierModule | null {
    return PhysicsRapierRuntime.loadedModule;
  }

  /**
   * Initializes the WebAssembly module and stores it for synchronous access.
   *
   * @returns The ready Rapier module.
   */
  private static async loadOnce(): Promise<PhysicsRapierModule> {
    await RAPIER.init();
    PhysicsRapierRuntime.loadedModule = RAPIER;
    return RAPIER;
  }
}
