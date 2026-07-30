import { createRequire } from 'node:module';
import { defineConfig } from 'cypress';
import webpackPreprocessor from '@cypress/webpack-batteries-included-preprocessor';

const requireFromHere = createRequire(import.meta.url);

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: true,
    videoCompression: 32,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 15000,
    setupNodeEvents(on) {
      // TypeScript 7 support: register the project-local preprocessor and
      // point its version detection at the package manifest, since the TS 7
      // package exposes no JavaScript API entry point for require().
      const typescriptManifestPath = requireFromHere.resolve('typescript/package.json');
      on('file:preprocessor', webpackPreprocessor({ typescript: typescriptManifestPath }));
      on('before:browser:launch', (_browser, launchOptions) => {
        launchOptions.args.push('--enable-unsafe-swiftshader');
        return launchOptions;
      });
    },
  },
});
