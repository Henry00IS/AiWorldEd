import type * as THREE from 'three';
import { ContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';

/** Material fields that identify an instance rather than describe its look. */
const SURFACE_MATERIAL_IDENTITY_KEYS = new Set(['uuid', 'id', 'version', '_listeners', 'uniforms', 'color', '_map']);

/** Result of matching freshly built materials against a mesh's previous ones. */
export interface SurfaceMaterialMatch {
  /** Materials to assign, in slot order. */
  materials: ContentViewLitMaterial[];
  /** Previous materials not reused and fresh materials replaced by reuse. */
  discarded: THREE.Material[];
}

/**
 * Keeps a mesh's previous surface materials when they are indistinguishable
 * from freshly built ones. Swapping an equal material for a new instance makes
 * the renderer release and relink its shader program, which is expensive on
 * every rebuild during a drag.
 */
export class SurfaceMaterialReuse {
  /**
   * Replaces each fresh material by an equivalent unused previous material.
   *
   * @param fresh Freshly built materials in slot order.
   * @param previous Materials the mesh currently owns.
   * @returns Materials to assign and materials to dispose.
   */
  static match(fresh: readonly ContentViewLitMaterial[], previous: readonly THREE.Material[]): SurfaceMaterialMatch {
    const unused = previous.slice();
    const discarded: THREE.Material[] = [];
    const materials = fresh.map((material) => {
      const index = unused.findIndex((candidate) => SurfaceMaterialReuse.equivalent(candidate, material));
      const kept = index >= 0 ? unused.splice(index, 1)[0] : undefined;
      if (!(kept instanceof ContentViewLitMaterial)) return material;
      discarded.push(material);
      return kept;
    });
    return { materials, discarded: discarded.concat(unused) };
  }

  /**
   * Returns whether a previous material renders exactly like a fresh one: same
   * class, tint, map, uniform values and every other own field.
   *
   * @param candidate Previous material.
   * @param fresh Freshly built material.
   * @returns True when the candidate can stand in for the fresh material.
   */
  static equivalent(candidate: THREE.Material, fresh: ContentViewLitMaterial): boolean {
    if (!(candidate instanceof ContentViewLitMaterial) || candidate === fresh) return false;
    if (candidate.map !== fresh.map || !candidate.color.equals(fresh.color)) return false;
    return SurfaceMaterialReuse.sameFields(candidate, fresh) && SurfaceMaterialReuse.sameUniforms(candidate, fresh);
  }

  /**
   * Compares every own field except instance identity.
   *
   * @param candidate Previous material.
   * @param fresh Fresh material.
   * @returns True when all fields match.
   */
  private static sameFields(candidate: ContentViewLitMaterial, fresh: ContentViewLitMaterial): boolean {
    const candidateFields = candidate as unknown as Record<string, unknown>;
    const freshFields = fresh as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(candidateFields), ...Object.keys(freshFields)]);
    for (const key of keys) {
      if (SURFACE_MATERIAL_IDENTITY_KEYS.has(key)) continue;
      if (!SurfaceMaterialReuse.sameValue(candidateFields[key], freshFields[key])) return false;
    }
    return true;
  }

  /**
   * Compares uniform names and values.
   *
   * @param candidate Previous material.
   * @param fresh Fresh material.
   * @returns True when every uniform holds an equal value.
   */
  private static sameUniforms(candidate: ContentViewLitMaterial, fresh: ContentViewLitMaterial): boolean {
    const names = Object.keys(fresh.uniforms);
    if (names.length !== Object.keys(candidate.uniforms).length) return false;
    return names.every((name) =>
      SurfaceMaterialReuse.sameValue(candidate.uniforms[name]?.value, fresh.uniforms[name]?.value),
    );
  }

  /**
   * Compares two field values: identical, equal by an `equals` method (colors,
   * vectors), or equal plain data (objects and arrays of primitives).
   *
   * @param left First value.
   * @param right Second value.
   * @returns True when the values are equal.
   */
  private static sameValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
    const comparable = left as { equals?: (other: unknown) => boolean };
    if (typeof comparable.equals === 'function') return comparable.equals(right);
    if (!SurfaceMaterialReuse.isPlainData(left) || !SurfaceMaterialReuse.isPlainData(right)) return false;
    return JSON.stringify(left) === JSON.stringify(right);
  }

  /**
   * Returns whether a value is a plain object or array.
   *
   * @param value Object value.
   * @returns True for plain objects and arrays.
   */
  private static isPlainData(value: object): boolean {
    const prototype: unknown = Object.getPrototypeOf(value);
    return Array.isArray(value) || prototype === Object.prototype || prototype === null;
  }
}
