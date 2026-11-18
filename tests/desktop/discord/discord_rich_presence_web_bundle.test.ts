import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = process.cwd();
const staticImportPattern = /^[ \t]*(?:import|export)[ \t]+(?!type(?:[ \t]+|{))[^'"\n]*['"]([^'"]+)['"]/gm;
const dynamicImportPattern = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

describe('discord_rich_presence_web_bundle', () => {
  it('keeps the Discord IPC client out of the web editor import graph', () => {
    const reachable = collectReachableModules(join(workspaceRoot, 'src/app.ts'));
    const forbidden = [...reachable].filter((file) => file.includes('src/desktop/discord/discord_ipc'));
    expect(forbidden).toEqual([]);
    expect(reachable.has(normalize('src/desktop/discord/discord_rich_presence_host.ts'))).toBe(false);
    expect(reachable.has(normalize('src/desktop/discord/discord_ipc_transport_net.ts'))).toBe(false);
    expect(reachable.has(normalize('src/desktop/bun/index.ts'))).toBe(false);
  });

  it('lets the desktop shell import the Discord host and reporter', () => {
    const bun = collectReachableModules(join(workspaceRoot, 'src/desktop/bun/index.ts'));
    const mainUi = collectReachableModules(join(workspaceRoot, 'src/desktop/main_ui/index.ts'));
    expect(bun.has(normalize('src/desktop/discord/discord_rich_presence_host.ts'))).toBe(true);
    expect(bun.has(normalize('src/desktop/discord/discord_ipc_transport_net.ts'))).toBe(true);
    expect(mainUi.has(normalize('src/desktop/discord/discord_rich_presence_reporter.ts'))).toBe(true);
    expect(mainUi.has(normalize('src/desktop/discord/discord_ipc_transport_net.ts'))).toBe(false);
  });
});

/**
 * Walks TypeScript imports starting from an entry file, skipping type-only
 * imports.
 *
 * @param entry Absolute entry path.
 * @returns Workspace-relative module paths.
 */
function collectReachableModules(entry: string): Set<string> {
  const reachable = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || reachable.has(current)) continue;
    if (!current.startsWith(workspaceRoot) || !current.endsWith('.ts')) continue;
    reachable.add(current);
    for (const specifier of moduleSpecifiers(current)) {
      const resolved = resolveSpecifier(current, specifier);
      if (resolved !== null) queue.push(resolved);
    }
  }
  return new Set([...reachable].map((file) => relative(workspaceRoot, file)));
}

/**
 * Lists non-type-only import specifiers in a TypeScript file.
 *
 * @param file Absolute file path.
 * @returns Module specifiers.
 */
function moduleSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  for (const match of text.matchAll(staticImportPattern)) {
    if (match[1]) specifiers.push(match[1]);
  }
  for (const match of text.matchAll(dynamicImportPattern)) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Resolves a @/ or relative specifier to an absolute TypeScript path.
 *
 * @param from Absolute importer path.
 * @param specifier Import specifier.
 * @returns Absolute path, or null when the specifier is a package.
 */
function resolveSpecifier(from: string, specifier: string): string | null {
  const bare = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
  if (!bare.startsWith('@/') && !bare.startsWith('.')) return null;
  const resolved = bare.startsWith('@/')
    ? `${join(workspaceRoot, 'src', bare.slice(2))}.ts`
    : `${join(dirname(from), bare)}.ts`;
  return existsSync(resolved) ? resolved : null;
}

/**
 * Normalizes a workspace-relative path to the same form as
 * collectReachableModules.
 *
 * @param relativePath Workspace-relative path.
 * @returns Normalized relative path.
 */
function normalize(relativePath: string): string {
  return relative(workspaceRoot, join(workspaceRoot, relativePath));
}
