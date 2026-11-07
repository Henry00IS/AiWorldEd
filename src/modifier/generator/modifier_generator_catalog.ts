import type { GeneratorKind } from './modifier_generator_types.js';

const modules = import.meta.glob<GeneratorKind>('./kinds/*/volume_kind.ts', { eager: true, import: 'default' });
/** Merge-safe discovery: each feature contributes only its own directory. */
export const generatorKinds: readonly GeneratorKind[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));

/** Finds an installed strategy. @param id Persisted strategy identity. */
export function generatorKindFind(id: string): GeneratorKind | undefined {
  return generatorKinds.find((kind) => kind.id === id);
}
