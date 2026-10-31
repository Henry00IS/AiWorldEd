import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { LoaderCollaborationMenu } from '@/collaboration/loader/loader_collaboration_menu.js';
import type { HostCollaborationEditor } from '@/collaboration/host/host_collaboration_editor.js';

const controllerImported = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/collaboration/runtime/controller_collaboration_runtime.js', () => {
  controllerImported.count += 1;
  return {
    ControllerCollaboration: class {
      /**
       * Reports no room.
       *
       * @returns False.
       */
      inRoom(): boolean {
        return false;
      }
    },
  };
});

const SOURCE_ROOT = join(process.cwd(), 'src');
const EAGER_COLLABORATION_MODULES = new Set([
  '@/collaboration/loader/loader_collaboration_menu.js',
  '@/collaboration/config/config_collaboration_server.js',
]);

/**
 * Lists every TypeScript file under a directory.
 *
 * @param directory Directory.
 * @returns File paths.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Returns the value (non type-only) collaboration imports of a file.
 *
 * @param path File path.
 * @returns Imported module specifiers.
 */
function collaborationValueImports(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const pattern = /^import\s+(?!type\b)[^;]*?from\s+'(@\/collaboration\/[^']+)'/gms;
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

/**
 * Creates a counting no-op command.
 *
 * @param counter Execution counter.
 * @returns Command.
 */
function commandCreate(counter: { value: number }): UndoCommand {
  return { execute: () => void (counter.value += 1), undo: () => void (counter.value -= 1) };
}

let sockets = 0;

beforeEach(() => {
  sockets = 0;
  vi.stubGlobal(
    'WebSocket',
    vi.fn(() => {
      sockets += 1;
      return {};
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

/**
 * Collaboration is optional: offline editing loads only the menu stub, opens no
 * socket and leaves undo and selection on their original paths.
 */
describe('offline editing without collaboration', () => {
  it('keeps the collaboration runtime out of the static import graph', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => !relative(SOURCE_ROOT, path).startsWith('collaboration'))
      .flatMap((path) => collaborationValueImports(path).filter((name) => !EAGER_COLLABORATION_MODULES.has(name)));
    expect(offenders).toEqual([]);
    const loaderPath = join(SOURCE_ROOT, 'collaboration/loader/loader_collaboration_menu.ts');
    expect(collaborationValueImports(loaderPath)).toEqual([]);
  });

  it('builds the Online menu without importing the runtime, building the host or opening a socket', () => {
    const hostCreate = vi.fn(() => ({}) as HostCollaborationEditor);
    const menu = new LoaderCollaborationMenu(hostCreate, true);
    const entries = menu.entries();
    expect(entries.length).toBeGreaterThan(0);
    expect(menu.active()).toBe(false);
    entries.forEach((entry) => entry.isEnabled?.());
    expect(controllerImported.count).toBe(0);
    expect(hostCreate).not.toHaveBeenCalled();
    expect(sockets).toBe(0);
  });

  it('loads the runtime once, on first use only', async () => {
    const hostCreate = vi.fn(() => ({}) as HostCollaborationEditor);
    const menu = new LoaderCollaborationMenu(hostCreate, true);
    await menu.run(async () => undefined);
    await menu.run(async () => undefined);
    expect(controllerImported.count).toBe(1);
    expect(hostCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps local undo and redo on the command stack while no observer is attached', () => {
    const stack = new CommandStack(10);
    const counter = { value: 0 };
    const command = commandCreate(counter);
    stack.push(command);
    expect(counter.value).toBe(1);
    expect(stack.getUndoCount()).toBe(1);
    expect(stack.undo()).toBe(true);
    expect(counter.value).toBe(0);
    expect(stack.redo()).toBe(true);
    expect(counter.value).toBe(1);
  });

  it('admits every selection while no admission check is installed', () => {
    const selection = new ManagerSelection();
    const meshes = [new THREE.Mesh(), new THREE.Mesh()];
    expect(selection.setSelection(meshes)).toBe(true);
    expect(selection.getSelectedObjectCount()).toBe(meshes.length);
  });
});
