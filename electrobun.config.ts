import type { ElectrobunConfig } from 'electrobun';
import packageMetadata from './package.json';

const electrobunConfig: ElectrobunConfig = {
  app: {
    name: 'AiWorldEd',
    identifier: 'com.henry00is.aiworlded',
    version: packageMetadata.version,
    description: 'Three.js 3D world editor for game level design.',
  },
  build: {
    mainProcess: 'bun',
    bun: {
      entrypoint: 'src/desktop/bun/index.ts',
    },
    views: {
      main_ui: {
        entrypoint: 'src/desktop/main_ui/index.ts',
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
