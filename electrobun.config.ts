import type { ElectrobunConfig } from 'electrobun/bun';
import packageMetadata from './package.json';
import { createElectrobunBuildPlugins } from './scripts/electrobun_tsconfig_paths_plugin.js';

const electrobunBuildPlugins = createElectrobunBuildPlugins();

const electrobunConfig: ElectrobunConfig = {
  app: {
    name: 'AiWorldEd',
    identifier: 'com.henry00is.aiworlded',
    version: packageMetadata.version,
    description: 'Three.js 3D world editor for game level design.',
  },
  build: {
    // Same Bun as package.json "packageManager", CI and the relay server, so the
    // desktop app does not run the older Bun bundled with Electrobun.
    bunVersion: '1.4.4',
    bun: {
      entrypoint: 'src/desktop/bun/index.ts',
      plugins: electrobunBuildPlugins,
    },
    views: {
      main_ui: {
        entrypoint: 'src/desktop/main_ui/index.ts',
        plugins: electrobunBuildPlugins,
      },
    },
    copy: {
      'src/desktop/main_ui/index.html': 'views/main_ui/index.html',
      'public/favicon.ico': 'views/main_ui/favicon.ico',
      'public/favicon-16x16.png': 'views/main_ui/favicon-16x16.png',
      'public/favicon-32x32.png': 'views/main_ui/favicon-32x32.png',
      'public/apple-touch-icon.png': 'views/main_ui/apple-touch-icon.png',
      'public/android-chrome-192x192.png': 'views/main_ui/android-chrome-192x192.png',
      'public/android-chrome-512x512.png': 'views/main_ui/android-chrome-512x512.png',
    },
    buildFolder: 'desktop_build',
    artifactFolder: 'desktop_artifacts',
    win: {
      defaultRenderer: 'native',
      bundleCEF: false,
      // Electrobun embeds this into launcher.exe, bun.exe, and Setup.exe before
      // the Setup zip is created (required for GitHub Actions release assets).
      icon: 'public/app_icon.ico',
    },
    mac: {
      defaultRenderer: 'native',
      bundleCEF: false,
      createDmg: false,
      icons: 'public/app_icon.iconset',
    },
    linux: {
      defaultRenderer: 'native',
      bundleCEF: false,
      icon: 'public/android-chrome-512x512.png',
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {
    postBuild: 'scripts/embed_windows_app_icon.ts',
    postPackage: 'scripts/embed_windows_app_icon.ts',
  },
  release: {
    baseUrl: 'https://github.com/Henry00IS/AiWorldEd/releases/latest/download',
    generatePatch: false,
  },
};

export default electrobunConfig;
