describe('primitive creation', () => {
  it('creates a cube through the Add menu and shows it in the outliner', () => {
    let objectNamesBefore: string[] = [];
    cy.visit('/?e2e=1');
    cy.waitForEditor();
    cy.editorApi().then((api) => {
      objectNamesBefore = api.getSceneSummary().objects.map((object) => object.name);
    });

    cy.contains('.editor-toolbar .editor-toolbar-menu-button', 'Add').click();
    cy.contains('.editor-toolbar-dropdown-item', 'Geometry').trigger('mouseenter');
    cy.contains('.editor-toolbar-dropdown-item', 'Cube').click();

    cy.editorApi().then((api) => {
      const namesAfter = api.getSceneSummary().objects.map((object) => object.name);
      const createdNames = namesAfter.filter((name) => !objectNamesBefore.includes(name));
      expect(createdNames).to.have.length(1);
      expect(api.getSelectedNames()).to.include(createdNames[0]);
      cy.wrap(createdNames[0], { log: false }).as('createdName');
    });

    cy.get<string>('@createdName').then((createdName) => {
      cy.get('.editor-outliner-panel').contains(createdName).should('exist');
    });
  });
});
