const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repositoryRoot = path.join(__dirname, '..');
const stagingDirectory = path.join(os.tmpdir(), 'aiworlded-electron-pack');
const buildsDirectory = path.join(repositoryRoot, 'builds');

/**
 * Deletes a directory tree if it exists.
 * @param {string} directoryPath Absolute path to remove.
 */
function removeDirectoryIfExists(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true });
}

/**
 * Recursively copies a file or directory tree.
 * @param {string} sourcePath Source file or directory path.
 * @param {string} destinationPath Destination file or directory path.
 */
function copyPathRecursive(sourcePath, destinationPath) {
  const sourceStats = fs.statSync(sourcePath);
  if (sourceStats.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entryName of fs.readdirSync(sourcePath)) {
      copyPathRecursive(
        path.join(sourcePath, entryName),
        path.join(destinationPath, entryName),
      );
    }
    return;
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

/**
 * Runs electron-builder into a local temp staging directory.
 */
function packageIntoStagingDirectory() {
  removeDirectoryIfExists(stagingDirectory);
  fs.mkdirSync(stagingDirectory, { recursive: true });

  const builderCommand = [
    'npx electron-builder --win portable',
    `--config.directories.output=${JSON.stringify(stagingDirectory)}`,
  ].join(' ');

  execSync(builderCommand, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });
}

/**
 * Copies staged package artifacts into the repository builds folder.
 */
function publishStagingToBuildsDirectory() {
  removeDirectoryIfExists(buildsDirectory);
  fs.mkdirSync(buildsDirectory, { recursive: true });
  copyPathRecursive(stagingDirectory, buildsDirectory);
}

/**
 * Packages the desktop app and publishes artifacts to builds/.
 */
function packDesktopApplication() {
  packageIntoStagingDirectory();
  publishStagingToBuildsDirectory();
  console.log(`Desktop package written to ${buildsDirectory}`);
}

packDesktopApplication();
