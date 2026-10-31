/**
 * Copies the relay server's shared protocol modules into the editor.
 *
 * Usage: `bun scripts/collaboration_shared_sync.ts [--check] [--server
 * <path>]`. Without `--check` the copies under `src/collaboration/shared` are
 * rewritten; with `--check` the script exits non-zero when any copy is out of
 * date.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

/** File names shared between the relay server and the editor. */
export const COLLABORATION_SHARED_FILES = [
  'protocol_definitions.ts',
  'binary_frame.ts',
  'password_policy.ts',
  'password_generator.ts',
  'room_name_policy.ts',
] as const;

/** Repository root of the editor. */
export const COLLABORATION_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Relay server checkout: `AIWORLDED_SERVER_DIR`, else a sibling of the editor. */
export const COLLABORATION_SERVER_DEFAULT = resolve(
  process.env['AIWORLDED_SERVER_DIR'] ?? join(COLLABORATION_REPOSITORY_ROOT, '..', 'aiworlded-server'),
);

/** Editor directory that receives the copies. */
export const COLLABORATION_SHARED_TARGET = join(COLLABORATION_REPOSITORY_ROOT, 'src', 'collaboration', 'shared');

/**
 * Rewrites one server source file into the editor's copy (header, `.js`
 * imports) and formats it with the editor's Prettier settings.
 *
 * @param fileName Shared file name.
 * @param serverSource Server file content.
 * @returns Formatted editor copy.
 */
export async function sharedCopyRender(fileName: string, serverSource: string): Promise<string> {
  const header = `/* Generated from aiworlded-server/src/shared/${fileName} by scripts/collaboration_shared_sync.ts. Do not edit. */\n`;
  const rewritten = serverSource.replace(/from '(\.\/[a-z_]+)\.ts'/g, "from '$1.js'");
  const target = join(COLLABORATION_SHARED_TARGET, fileName);
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(header + rewritten, { ...options, filepath: target });
}

/**
 * Lists shared files whose editor copy differs from the rendered server file.
 *
 * @param serverRoot Relay server checkout.
 * @returns Out-of-date file names.
 */
export async function sharedCopiesStale(serverRoot: string): Promise<string[]> {
  const stale: string[] = [];
  for (const fileName of COLLABORATION_SHARED_FILES) {
    const rendered = await sharedCopyRender(
      fileName,
      readFileSync(join(serverRoot, 'src', 'shared', fileName), 'utf8'),
    );
    const targetPath = join(COLLABORATION_SHARED_TARGET, fileName);
    const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
    if (current !== rendered) stale.push(fileName);
  }
  return stale;
}

/**
 * Writes every rendered copy.
 *
 * @param serverRoot Relay server checkout.
 */
async function sharedCopiesWrite(serverRoot: string): Promise<void> {
  for (const fileName of COLLABORATION_SHARED_FILES) {
    const source = readFileSync(join(serverRoot, 'src', 'shared', fileName), 'utf8');
    writeFileSync(join(COLLABORATION_SHARED_TARGET, fileName), await sharedCopyRender(fileName, source));
  }
}

/** Entry point. */
async function main(): Promise<void> {
  const serverIndex = process.argv.indexOf('--server');
  const serverRoot = serverIndex > 0 ? resolve(process.argv[serverIndex + 1] ?? '') : COLLABORATION_SERVER_DEFAULT;
  if (!existsSync(join(serverRoot, 'src', 'shared'))) throw new Error(`No relay server checkout at ${serverRoot}`);
  if (!process.argv.includes('--check')) {
    await sharedCopiesWrite(serverRoot);
    return console.log(`Shared files copied from ${serverRoot}.`);
  }
  const stale = await sharedCopiesStale(serverRoot);
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}. Run bun run collab:shared:sync.`);
    process.exit(1);
  }
  console.log('Shared files are up to date.');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
