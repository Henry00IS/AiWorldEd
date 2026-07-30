describe('application boot', () => {
  it('starts the editor without errors and renders the workspace', () => {
    const runtimeErrors: string[] = [];
    const consoleErrors: string[] = [];
    cy.visit('/?e2e=1', {
      onBeforeLoad(win) {
        win.addEventListener('error', (event) => runtimeErrors.push(event.message));
        win.addEventListener('unhandledrejection', (event) => runtimeErrors.push(String(event.reason)));
        const originalConsoleError = win.console.error.bind(win.console);
        win.console.error = (...args) => {
          consoleErrors.push(args.map(String).join(' '));
          originalConsoleError(...args);
        };
      },
    });

    cy.waitForEditor();

    cy.get('#editor-container canvas')
      .should('be.visible')
      .and(($canvas) => {
        const bounds = $canvas[0]!.getBoundingClientRect();
        expect(bounds.width).to.be.greaterThan(0);
        expect(bounds.height).to.be.greaterThan(0);
      });
    cy.get('.editor-toolbar').should('exist').and('be.visible');
    cy.get('.editor-outliner-panel').should('exist').and('be.visible');
    cy.get('.editor-status-bar').should('exist');

    cy.editorApi()
      .its('isReady')
      .then((isReady) => expect(isReady()).to.equal(true));

    cy.then(() => {
      expect(runtimeErrors).to.deep.equal([]);
      expect(consoleErrors).to.deep.equal([]);
    });
  });
});
