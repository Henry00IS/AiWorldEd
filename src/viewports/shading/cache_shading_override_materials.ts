import * as THREE from 'three';
import { ShadingMode } from '@/types/shading_mode.js';

/** Builds one shading override material from a content material. */
export type ShadingOverrideFactory = (source: THREE.Material) => THREE.Material;

/**
 * Keeps shading override materials alive across mode switches so multi-view
 * passes reuse them instead of disposing and rebuilding them (which made
 * Three.js delete and recompile the override shader program every frame).
 */
export class CacheShadingOverrideMaterials {
  private readonly overridesBySource: Map<THREE.Material, Map<ShadingMode, THREE.Material>>;
  private readonly sourceByOverride: Map<THREE.Material, THREE.Material>;

  /** Creates an empty override cache. */
  constructor() {
    this.overridesBySource = new Map();
    this.sourceByOverride = new Map();
  }

  /**
   * Returns the cached override for a content material and mode, creating it on
   * first use and re-syncing it from the content material otherwise.
   *
   * @param source Content material the override mirrors.
   * @param mode Shading mode the override belongs to.
   * @param createOverride Factory used on a cache miss.
   * @returns Override material for this source and mode.
   */
  resolve(source: THREE.Material, mode: ShadingMode, createOverride: ShadingOverrideFactory): THREE.Material {
    const cached = this.overridesBySource.get(source)?.get(mode);
    if (cached) {
      syncOverrideFromSource(cached, source, mode);
      return cached;
    }
    const created = createOverride(source);
    this.store(source, mode, created);
    return created;
  }

  /**
   * Disposes overrides whose content material is no longer in the scene.
   *
   * @param liveSources Content materials currently used by content meshes.
   */
  pruneMissingSources(liveSources: ReadonlySet<THREE.Material>): void {
    const staleSources: THREE.Material[] = [];
    this.overridesBySource.forEach((_overrides, source) => {
      if (!liveSources.has(source)) staleSources.push(source);
    });
    staleSources.forEach((source) => this.disposeSource(source));
  }

  /** Disposes every cached override. */
  disposeAll(): void {
    Array.from(this.overridesBySource.keys()).forEach((source) => this.disposeSource(source));
  }

  /**
   * Returns how many override materials are cached (tests / diagnostics).
   *
   * @returns Cached override count.
   */
  size(): number {
    return this.sourceByOverride.size;
  }

  /**
   * Records a new override and evicts it if something else disposes it.
   *
   * @param source Content material.
   * @param mode Shading mode.
   * @param override Newly created override.
   */
  private store(source: THREE.Material, mode: ShadingMode, override: THREE.Material): void {
    let overrides = this.overridesBySource.get(source);
    if (!overrides) {
      overrides = new Map();
      this.overridesBySource.set(source, overrides);
    }
    overrides.set(mode, override);
    this.sourceByOverride.set(override, source);
    override.addEventListener('dispose', () => this.evictOverride(override, mode));
  }

  /**
   * Removes one override from the cache without disposing it again.
   *
   * @param override Override that was disposed.
   * @param mode Shading mode it was cached under.
   */
  private evictOverride(override: THREE.Material, mode: ShadingMode): void {
    const source = this.sourceByOverride.get(override);
    if (!source) return;
    this.sourceByOverride.delete(override);
    const overrides = this.overridesBySource.get(source);
    if (overrides?.get(mode) === override) overrides.delete(mode);
    if (overrides && overrides.size === 0) this.overridesBySource.delete(source);
  }

  /**
   * Disposes every override built from one content material.
   *
   * @param source Content material whose overrides are released.
   */
  private disposeSource(source: THREE.Material): void {
    const overrides = Array.from(this.overridesBySource.get(source)?.values() ?? []);
    overrides.forEach((override) => {
      if ('map' in override) (override as THREE.MeshBasicMaterial).map = null;
      override.dispose();
    });
    this.overridesBySource.delete(source);
  }
}

/**
 * Copies the content properties an override mirrors, flagging a program rebuild
 * only when a property that changes the shader variant changed.
 *
 * @param override Cached override material.
 * @param source Content material it mirrors.
 * @param mode Shading mode the override belongs to.
 */
function syncOverrideFromSource(override: THREE.Material, source: THREE.Material, mode: ShadingMode): void {
  const sourceSide = 'side' in source ? source.side : THREE.FrontSide;
  if (override.side !== sourceSide) {
    override.side = sourceSide;
    override.needsUpdate = true;
  }
  if (mode === ShadingMode.FLAT) syncUnlitAlbedoFromSource(override as THREE.MeshBasicMaterial, source);
}

/**
 * Mirrors color and map onto a Flat-mode override.
 *
 * @param override Flat-mode MeshBasicMaterial.
 * @param source Content material it mirrors.
 */
function syncUnlitAlbedoFromSource(override: THREE.MeshBasicMaterial, source: THREE.Material): void {
  const sourceColor = 'color' in source ? (source as THREE.MeshBasicMaterial).color : null;
  override.color.setHex(sourceColor instanceof THREE.Color ? sourceColor.getHex() : 0xffffff);
  const sourceMap = 'map' in source ? ((source as THREE.MeshBasicMaterial).map ?? null) : null;
  if (override.map === sourceMap) return;
  const mapPresenceChanged = (override.map === null) !== (sourceMap === null);
  override.map = sourceMap;
  if (mapPresenceChanged) override.needsUpdate = true;
}
