import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Root of the SolidScript sources. */
const SOLID_SCRIPT_SOURCE_ROOT = join(process.cwd(), 'src', 'solid_script');

/**
 * Lists every file under a folder.
 *
 * @param folder Folder.
 * @returns File paths.
 */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(folder, entry.name)) : [join(folder, entry.name)],
  );
}

describe('SolidScript sources', () => {
  it('never run text as code: no eval( and no new Function( anywhere in src/solid_script', () => {
    const files = sourceFiles(SOLID_SCRIPT_SOURCE_ROOT);
    expect(files.length).toBeGreaterThan(0);
    const found = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /\beval\s*\(|\bnew\s+Function\s*\(/.test(line)
            ? [`${file.slice(process.cwd().length + 1)}:${index + 1}`]
            : [],
        ),
    );
    expect(found).toEqual([]);
  });
});
