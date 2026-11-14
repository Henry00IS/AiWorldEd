/**
 * Turns raw Electrobun desktop_artifacts into the public GitHub release set.
 *
 * Usage: bun scripts/package_desktop_release.ts bun
 * scripts/package_desktop_release.ts --version 1.0.42 bun
 * scripts/package_desktop_release.ts --input desktop_artifacts --output
 * release_dist.
 *
 * Publishes:
 *
 * - Versioned Setup installers for human download.
 * - Electrobun-named portable tarballs (auto-update payload; one copy only)
 * - Electrobun-named update.json and update-v2.json metadata (auto-update check)
 *
 * Drops hash-named .patch files. Does not publish a second "Portable" alias of
 * the same tarball — that would only duplicate the update payload.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import packageMetadata from '../package.json';
import {
  buildElectrobunUpdateJsonFileName,
  buildElectrobunUpdateJsonV2FileName,
  buildPublicSetupFileName,
  parseElectrobunArtifactFileName,
  type ParsedElectrobunArtifact,
} from '../src/desktop/release_asset_naming.js';

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? packageMetadata.version;
const inputDir = resolve(projectRoot, args.input ?? 'desktop_artifacts');
const outputDir = resolve(projectRoot, args.output ?? 'release_dist');

if (!existsSync(inputDir)) {
  throw new Error(`Input directory not found: ${inputDir}`);
}

resetOutputDirectory(outputDir);
const sourceFiles = readdirSync(inputDir).filter((name) => statSync(join(inputDir, name)).isFile());
const published: string[] = [];
const portables: string[] = [];
const updateJsonFiles: string[] = [];

for (const fileName of sourceFiles) {
  const parsed = parseElectrobunArtifactFileName(fileName);
  if (!parsed) {
    console.log(`Skipping unrecognized artifact: ${fileName}`);
    continue;
  }
  if (parsed.kind === 'patch' || parsed.kind === 'unknown') {
    console.log(`Dropping ${parsed.kind} artifact: ${fileName}`);
    continue;
  }
  publishArtifact(parsed, join(inputDir, fileName), outputDir, version, published, portables, updateJsonFiles);
}

assertUpdaterPairs(portables, updateJsonFiles);

if (published.length === 0) {
  throw new Error(`No release files were produced from ${inputDir}`);
}

console.log(`Packaged ${published.length} release files into ${outputDir}`);
for (const name of published.sort()) console.log(`  ${name}`);

/**
 * Publishes one recognized Electrobun artifact into the clean release folder.
 *
 * @param parsed Parsed artifact identity.
 * @param sourcePath Absolute path to the Electrobun artifact.
 * @param destinationDir Output release directory.
 * @param releaseVersion Version string embedded in public Setup names.
 * @param published Accumulator of published file names.
 * @param portables Accumulator of published portable tarball names.
 * @param updateJsonFiles Accumulator of published update.json names.
 */
function publishArtifact(
  parsed: ParsedElectrobunArtifact,
  sourcePath: string,
  destinationDir: string,
  releaseVersion: string,
  published: string[],
  portables: string[],
  updateJsonFiles: string[],
): void {
  if (parsed.kind === 'update-json') {
    copyIntoRelease(sourcePath, destinationDir, parsed.fileName, published);
    updateJsonFiles.push(parsed.fileName);
    return;
  }
  if (parsed.kind === 'portable') {
    copyIntoRelease(sourcePath, destinationDir, parsed.fileName, published);
    portables.push(parsed.fileName);
    return;
  }
  if (parsed.kind === 'setup') {
    publishSetupArtifact(parsed, sourcePath, destinationDir, releaseVersion, published);
  }
}

/**
 * Publishes a Setup installer under a clean versioned name, keeping its archive
 * type.
 *
 * @param parsed Parsed setup artifact identity.
 * @param sourcePath Absolute path to the Electrobun setup artifact.
 * @param destinationDir Output release directory.
 * @param releaseVersion Version string embedded in public names.
 * @param published Accumulator of published file names.
 */
function publishSetupArtifact(
  parsed: ParsedElectrobunArtifact,
  sourcePath: string,
  destinationDir: string,
  releaseVersion: string,
  published: string[],
): void {
  const extension = resolveSetupExtension(parsed.fileName);
  const publicName = buildPublicSetupFileName(releaseVersion, parsed.os, parsed.arch, extension);
  copyIntoRelease(sourcePath, destinationDir, publicName, published);
}

/**
 * Resolves the public Setup extension from the Electrobun setup file name.
 *
 * @param fileName Electrobun setup artifact file name.
 * @returns Extension without a leading dot (zip, tar.gz, etc.).
 */
function resolveSetupExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  if (lower.endsWith('.tar.zst')) return 'tar.zst';
  const extension = extname(fileName).replace(/^\./, '');
  return extension.length > 0 ? extension : 'zip';
}

/**
 * Copies a file into the release folder under a chosen file name.
 *
 * @param sourcePath Absolute source path.
 * @param destinationDir Output directory.
 * @param destinationName Destination file name.
 * @param published Accumulator of published file names.
 */
function copyIntoRelease(
  sourcePath: string,
  destinationDir: string,
  destinationName: string,
  published: string[],
): void {
  copyFileSync(sourcePath, join(destinationDir, destinationName));
  if (!published.includes(destinationName)) published.push(destinationName);
  console.log(`Published: ${destinationName}`);
}

/**
 * Ensures every portable tarball has a matching update.json for auto-update.
 *
 * @param portableNames Published portable artifact names.
 * @param updateJsonNames Published update.json artifact names.
 */
function assertUpdaterPairs(portableNames: string[], updateJsonNames: string[]): void {
  for (const portableName of portableNames) {
    const parsed = parseElectrobunArtifactFileName(portableName);
    if (!parsed) continue;
    const expectedUpdateJsonNames = [
      buildElectrobunUpdateJsonFileName(parsed.channel, parsed.os, parsed.arch),
      buildElectrobunUpdateJsonV2FileName(parsed.channel, parsed.os, parsed.arch),
    ];
    for (const expectedUpdateJson of expectedUpdateJsonNames) {
      if (!updateJsonNames.includes(expectedUpdateJson)) {
        throw new Error(`Portable ${portableName} is missing matching ${expectedUpdateJson} for auto-update`);
      }
    }
  }
  if (portableNames.length === 0) {
    throw new Error('No portable update payload was published; auto-update would be broken');
  }
  if (updateJsonNames.length === 0) {
    throw new Error('No update.json metadata was published; auto-update would be broken');
  }
}

/**
 * Clears and recreates the output directory.
 *
 * @param directory Absolute output directory path.
 */
function resetOutputDirectory(directory: string): void {
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

/**
 * Parses CLI flags used by this packaging script.
 *
 * @param argv Process arguments after the script name.
 * @returns Parsed options.
 */
function parseArgs(argv: string[]): { version?: string; input?: string; output?: string } {
  const options: { version?: string; input?: string; output?: string } = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--version' && value) {
      options.version = value;
      index++;
    } else if (argument === '--input' && value) {
      options.input = value;
      index++;
    } else if (argument === '--output' && value) {
      options.output = value;
      index++;
    }
  }
  return options;
}
