import type { AiWorldedTestBridge } from '../../src/e2e_bridge/test_bridge_types.js';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Waits until the editor rendered its first frames. Uses the bridge ready
       * flag so specs never depend on fixed millisecond delays.
       */
      waitForEditor(): Chainable<void>;
      /**
       * Yields the installed E2E test bridge from the application window.
       * Requires the app to run with the `e2e` query parameter.
       */
      editorApi(): Chainable<AiWorldedTestBridge>;
    }
  }
}

Cypress.Commands.add('waitForEditor', () => {
  cy.window({ timeout: 60000 }).should((win) => {
    expect(win.__AIWORLDED_READY__, 'editor first rendered frame').to.equal(true);
  });
});

Cypress.Commands.add('editorApi', () => {
  return cy.window().then((win) => {
    const bridge = win.__AIWORLDED__;
    if (!bridge) {
      throw new Error('E2E test bridge not installed. Visit the app with the e2e query parameter.');
    }
    return bridge;
  });
});

export {};
