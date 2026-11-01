/**
 * Reports AGENTS.md compliance metrics for src/ and tests/.
 *
 * Usage: bun scripts/audit_agents_compliance.ts Exit code 1 when --strict and
 * any hard violation is found.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const workspaceRoot = process.cwd();
const srcRoot = join(workspaceRoot, 'src');
const testsRoot = join(workspaceRoot, 'tests');
const strictMode = process.argv.includes('--strict');

const FILE_LINE_WARN = 800;
const FILE_LINE_FAIL = 1000;

interface FileMetrics {
  path: string;
  lines: number;
  parentImports: number;
  parentImportsIntoSrc: number;
}

/**
 * Walks a directory tree and returns all .ts file paths.
 *
 * @param directory Absolute directory to walk.
 * @returns Absolute paths of TypeScript files.
 */
function collectTypeScriptFiles(directory: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Counts physical lines in a file.
 *
 * @param filePath Absolute file path.
 * @returns Line count.
 */
function countLines(filePath: string): number {
  const text = readFileSync(filePath, 'utf8');
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

/**
 * Counts import/export specifiers that use parent-directory segments.
 *
 * @param filePath Absolute file path.
 * @returns Number of `../` module specifiers.
 */
function countParentImports(filePath: string): number {
  const text = readFileSync(filePath, 'utf8');
  const matches = text.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.\.\/[^'"]+)['"]/g);
  let count = 0;
  for (const _match of matches) {
    count += 1;
  }
  return count;
}

/**
 * Counts parent imports that still resolve into src/ (should be @/ after
 * codemod).
 *
 * @param filePath Absolute file path.
 * @returns Number of convertible leftover `../` imports targeting src.
 */
function countParentImportsIntoSrc(filePath: string): number {
  const text = readFileSync(filePath, 'utf8');
  const fileDir = dirname(filePath);
  const matches = text.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.\.\/[^'"]+)['"]/g);
  let count = 0;
  for (const match of matches) {
    const specifier = match[1] ?? '';
    const withoutJs = specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts' : specifier;
    const resolved = resolve(fileDir, withoutJs);
    const repoRelative = toRepoPath(resolved);
    if (repoRelative.startsWith('src/')) {
      count += 1;
    }
  }
  return count;
}

/**
 * Converts an absolute path to a repo-relative posix-style path.
 *
 * @param absolutePath Absolute filesystem path.
 * @returns Repo-relative path using forward slashes.
 */
function toRepoPath(absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join('/');
}

/**
 * Returns true when every path segment is snake_case or a known exception.
 *
 * @param repoPath Repo-relative path.
 * @returns Whether the path complies with snake_case folders/files.
 */
function isSnakeCasePath(repoPath: string): boolean {
  const parts = repoPath.split('/');
  for (const part of parts) {
    if (part === 'src' || part === 'tests') {
      continue;
    }
    if (part.endsWith('.ts')) {
      const base = part.slice(0, -3);
      const suffix = ['.test', '.bench'].find((each) => base.endsWith(each));
      if (suffix !== undefined) {
        const testBase = base.slice(0, -suffix.length);
        if (!isSnakeCaseSegment(testBase) && testBase !== 'core' && testBase !== 'theme') {
          return false;
        }
        continue;
      }
      if (base.endsWith('.d')) {
        continue;
      }
      if (!isSnakeCaseSegment(base) && base !== 'types') {
        return false;
      }
      continue;
    }
    if (!isSnakeCaseSegment(part)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true when a single path segment is snake_case.
 *
 * @param segment Folder or file base name.
 * @returns Whether the segment matches snake_case.
 */
function isSnakeCaseSegment(segment: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(segment);
}

/**
 * Detects category-last filename heuristics called out by AGENTS examples.
 *
 * @param repoPath Repo-relative path.
 * @returns True when the basename looks category-last.
 */
function looksCategoryLast(repoPath: string): boolean {
  const base = repoPath.split('/').pop() ?? '';
  const name = base.replace(/\.test\.ts$/u, '').replace(/\.ts$/u, '');
  // Already category-first (AGENTS rule 15 / solid_algorithm_* examples).
  if (
    /^(command|handler|controller|manager|coordinator|factory|builder|panel|dialog|error|input|menu|status|toolbar)_/u.test(
      name,
    ) ||
    /^solid_algorithm_/u.test(name)
  ) {
    return false;
  }
  const categoryLast = [
    /_command$/u,
    /_handler$/u,
    /_controller$/u,
    /_manager$/u,
    /_error$/u,
    /_panel$/u,
    /_dialog$/u,
    /_factory$/u,
    /_builder$/u,
    /_helpers$/u,
    /_utils$/u,
  ];
  return categoryLast.some((pattern) => pattern.test(name));
}

/**
 * Builds metrics for every TypeScript file under src and tests.
 *
 * @returns File metrics list.
 */
function collectMetrics(): FileMetrics[] {
  const files = [...collectTypeScriptFiles(srcRoot), ...collectTypeScriptFiles(testsRoot)];
  return files.map((filePath) => ({
    path: toRepoPath(filePath),
    lines: countLines(filePath),
    parentImports: countParentImports(filePath),
    parentImportsIntoSrc: countParentImportsIntoSrc(filePath),
  }));
}

/**
 * Prints a titled list of paths with an optional numeric suffix.
 *
 * @param title Section title.
 * @param rows Display rows.
 * @param limit Maximum rows to print.
 */
function printSection(title: string, rows: string[], limit = 40): void {
  console.log(`\n## ${title} (${rows.length})`);
  const shown = rows.slice(0, limit);
  for (const row of shown) {
    console.log(`  ${row}`);
  }
  if (rows.length > limit) {
    console.log(`  … and ${rows.length - limit} more`);
  }
}

/** Entry point for the compliance audit. */
function main(): void {
  if (!statSync(srcRoot).isDirectory() || !statSync(testsRoot).isDirectory()) {
    console.error('Expected src/ and tests/ under the workspace root.');
    process.exit(2);
  }

  const metrics = collectMetrics();
  const overFail = metrics.filter((item) => item.lines > FILE_LINE_FAIL).sort((a, b) => b.lines - a.lines);
  const overWarn = metrics
    .filter((item) => item.lines > FILE_LINE_WARN && item.lines <= FILE_LINE_FAIL)
    .sort((a, b) => b.lines - a.lines);
  const parentImportFiles = metrics
    .filter((item) => item.parentImports > 0)
    .sort((a, b) => b.parentImports - a.parentImports);
  const parentImportTotal = parentImportFiles.reduce((sum, item) => sum + item.parentImports, 0);
  const parentIntoSrcFiles = metrics
    .filter((item) => item.parentImportsIntoSrc > 0)
    .sort((a, b) => b.parentImportsIntoSrc - a.parentImportsIntoSrc);
  const parentIntoSrcTotal = parentIntoSrcFiles.reduce((sum, item) => sum + item.parentImportsIntoSrc, 0);
  const nonSnake = metrics.map((item) => item.path).filter((path) => !isSnakeCasePath(path));
  const categoryLast = metrics.map((item) => item.path).filter((path) => looksCategoryLast(path));

  console.log('# AGENTS compliance audit');
  console.log(`files: ${metrics.length}`);
  console.log(`parent-directory imports (../): ${parentImportTotal} across ${parentImportFiles.length} files`);
  console.log(
    `parent imports still targeting src/ (should be @/): ${parentIntoSrcTotal} across ${parentIntoSrcFiles.length} files`,
  );
  console.log(`files > ${FILE_LINE_FAIL} lines: ${overFail.length}`);
  console.log(`files > ${FILE_LINE_WARN} and <= ${FILE_LINE_FAIL} lines: ${overWarn.length}`);
  console.log(`non-snake_case paths: ${nonSnake.length}`);
  console.log(`category-last name heuristic hits: ${categoryLast.length}`);

  printSection(
    `Files over ${FILE_LINE_FAIL} lines (hard AGENTS limit)`,
    overFail.map((item) => `${item.lines}\t${item.path}`),
  );
  printSection(
    `Files over ${FILE_LINE_WARN} lines`,
    overWarn.map((item) => `${item.lines}\t${item.path}`),
  );
  printSection(
    'Parent imports still targeting src/ (must be zero)',
    parentIntoSrcFiles.map((item) => `${item.parentImportsIntoSrc}\t${item.path}`),
  );
  printSection(
    'Remaining ../ imports (package.json, scripts, test-to-test — OK)',
    parentImportFiles.map((item) => `${item.parentImports}\t${item.path}`),
  );
  printSection('Non-snake_case paths', nonSnake);
  printSection('Category-last filename heuristic', categoryLast, 60);

  const hardViolations = overFail.length + (strictMode ? parentIntoSrcTotal : 0);
  if (strictMode && hardViolations > 0) {
    console.error(`\nStrict mode failed with ${hardViolations} hard violation signal(s).`);
    process.exit(1);
  }
}

main();
