import { HENRYS_TOOLS_DISCORD_URL, PROJECT_DISPLAY_NAME, getAboutLicenseText } from './about_license_text.js';
import { ContributorRoll } from './about_contributor_roll.js';
import { selectPortalQuote } from './portal_quotes.js';
import {
  createAboutShimmer,
  ensureAboutDialogStyles,
  styleAboutActionButton,
  styleAboutBackdrop,
  styleAboutBody,
  styleAboutCloseButton,
  styleAboutCreditLine,
  styleAboutFooter,
  styleAboutHeader,
  styleAboutLicenseBox,
  styleAboutPanel,
  styleAboutQuote,
  styleAboutSubtitle,
  styleAboutTitle,
} from './about_dialog_styles.js';

/** Fancy modal About dialog for AI World Editor credits and licenses. */
export class AboutDialog {
  private host: HTMLElement;
  private backdrop: HTMLElement;
  private panel: HTMLElement;
  private licenseTextArea: HTMLTextAreaElement;
  private isVisible: boolean;
  private isDisposed: boolean;
  private boundKeyDown: (event: KeyboardEvent) => void;
  private contributorRoll: ContributorRoll | null;
  private quoteElement: HTMLElement;
  private currentQuote: string | null;

  /**
   * Creates the About dialog and appends it to the host element.
   *
   * @param host Parent element that owns the modal overlay.
   */
  constructor(host: HTMLElement) {
    this.host = host;
    this.isVisible = false;
    this.isDisposed = false;
    this.contributorRoll = null;
    this.quoteElement = document.createElement('p');
    this.currentQuote = null;
    this.boundKeyDown = (event) => this.handleKeyDown(event);
    ensureAboutDialogStyles();
    this.backdrop = document.createElement('div');
    this.panel = document.createElement('div');
    this.licenseTextArea = document.createElement('textarea');
    this.buildDialog();
    this.host.appendChild(this.backdrop);
  }

  /** Shows the About dialog with entrance animations. */
  show(): void {
    if (this.isDisposed || this.isVisible) return;
    this.updatePortalQuote();
    this.isVisible = true;
    this.backdrop.style.display = 'flex';
    this.restartEntranceAnimation();
    document.addEventListener('keydown', this.boundKeyDown);
  }

  /** Hides the About dialog. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.backdrop.style.display = 'none';
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  /** Toggles dialog visibility. */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
      return;
    }
    this.show();
  }

  /**
   * Returns whether the dialog is currently open.
   *
   * @returns True when visible.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Returns the license textbox element for tests and focus management.
   *
   * @returns The readonly license textarea.
   */
  getLicenseTextArea(): HTMLTextAreaElement {
    return this.licenseTextArea;
  }

  /**
   * Returns the root backdrop element for tests.
   *
   * @returns Backdrop overlay element.
   */
  getBackdropElement(): HTMLElement {
    return this.backdrop;
  }

  /**
   * Returns the dialog panel element for tests.
   *
   * @returns Panel card element.
   */
  getPanelElement(): HTMLElement {
    return this.panel;
  }

  /** Removes the dialog from the DOM and clears listeners. */
  dispose(): void {
    if (this.isDisposed) return;
    this.hide();
    this.isDisposed = true;
    if (this.contributorRoll) {
      this.contributorRoll.dispose();
    }
    this.backdrop.remove();
  }

  /** Builds the full dialog DOM tree. */
  private buildDialog(): void {
    styleAboutBackdrop(this.backdrop);
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'About AI World Editor');
    styleAboutPanel(this.panel);
    this.panel.appendChild(this.buildHeader());
    this.panel.appendChild(this.buildBody());
    this.backdrop.appendChild(this.panel);
    this.backdrop.addEventListener('pointerdown', (event) => {
      this.handleBackdropPointerDown(event);
    });
  }

  /**
   * Builds the animated header with title and close control.
   *
   * @returns Header element.
   */
  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    styleAboutHeader(header);
    header.appendChild(createAboutShimmer());
    header.appendChild(this.createTitleBlock());
    header.appendChild(this.createCloseButton());
    return header;
  }

  /**
   * Creates the project title and tagline block.
   *
   * @returns Title block element.
   */
  private createTitleBlock(): HTMLElement {
    const block = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = PROJECT_DISPLAY_NAME;
    styleAboutTitle(title);
    const subtitle = document.createElement('p');
    subtitle.textContent = 'A 3D world editor for game development';
    styleAboutSubtitle(subtitle);
    block.appendChild(title);
    block.appendChild(subtitle);
    return block;
  }

  /**
   * Creates the header close button.
   *
   * @returns Close button element.
   */
  private createCloseButton(): HTMLButtonElement {
    const closeButton = document.createElement('button');
    styleAboutCloseButton(closeButton);
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    return closeButton;
  }

  /**
   * Builds the body with credits, proclamation, licenses, and actions.
   *
   * @returns Body element.
   */
  private buildBody(): HTMLElement {
    const body = document.createElement('div');
    styleAboutBody(body);
    body.appendChild(this.createQuote());
    body.appendChild(this.createCreditsSection());
    body.appendChild(this.createContributorRollSection());
    body.appendChild(this.createLicenseSection());
    body.appendChild(this.createFooterActions());
    return body;
  }

  /**
   * Creates the rotating Portal quote banner.
   *
   * @returns Quote element.
   */
  private createQuote(): HTMLElement {
    styleAboutQuote(this.quoteElement);
    this.quoteElement.setAttribute('aria-label', 'Portal quote');
    return this.quoteElement;
  }

  /** Selects a different Portal quote for the new dialog opening. */
  private updatePortalQuote(): void {
    this.currentQuote = selectPortalQuote(this.currentQuote);
    this.quoteElement.textContent = this.currentQuote;
  }

  /**
   * Creates the credits section listing humans and models.
   *
   * @returns Credits container.
   */
  private createCreditsSection(): HTMLElement {
    const section = document.createElement('div');
    section.classList.add('about-dialog-section', 'about-dialog-credits');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '8px';
    section.appendChild(this.createSectionLabel('Credits'));
    this.appendCreditLines(section);
    return section;
  }

  /**
   * Appends all credit paragraphs to the credits section.
   *
   * @param section Credits container.
   */
  private appendCreditLines(section: HTMLElement): void {
    const lines = [
      'Project Architect: Henry de Jongh',
      'Technical consultants: Grok Build 4.5 · Qwen 3.6 27B',
      'CSG geometry lineage: Sander van Rossen — Chisel Editor & RealtimeCSG',
      'Additional CSG inspiration: SabreCSG (MIT)',
      'Rendering and math: three.js',
    ];
    lines.forEach((line) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      styleAboutCreditLine(paragraph);
      section.appendChild(paragraph);
    });
  }

  /**
   * Creates the GitHub contributor roll section with animated avatar spheres.
   *
   * @returns Contributor roll section element.
   */
  private createContributorRollSection(): HTMLElement {
    const section = document.createElement('div');
    section.classList.add('about-dialog-section', 'about-dialog-contributors');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '8px';
    section.appendChild(this.createSectionLabel('GitHub Contributors'));
    this.contributorRoll = new ContributorRoll();
    section.appendChild(this.contributorRoll.getContainerElement());
    return section;
  }

  /**
   * Creates the third-party license textbox section.
   *
   * @returns License section element.
   */
  private createLicenseSection(): HTMLElement {
    const section = document.createElement('div');
    section.classList.add('about-dialog-section', 'about-dialog-licenses');
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '6px';
    section.appendChild(this.createSectionLabel('Third-party MIT Licenses'));
    this.configureLicenseTextArea();
    section.appendChild(this.licenseTextArea);
    return section;
  }

  /** Configures the readonly license textarea content and styles. */
  private configureLicenseTextArea(): void {
    this.licenseTextArea.readOnly = true;
    this.licenseTextArea.spellcheck = false;
    this.licenseTextArea.setAttribute('aria-label', 'Third-party MIT licenses');
    this.licenseTextArea.value = getAboutLicenseText();
    styleAboutLicenseBox(this.licenseTextArea);
  }

  /**
   * Creates Discord and Close footer actions.
   *
   * @returns Footer row element.
   */
  private createFooterActions(): HTMLElement {
    const row = document.createElement('div');
    styleAboutFooter(row);
    row.appendChild(this.createDiscordButton());
    row.appendChild(this.createFooterCloseButton());
    return row;
  }

  /**
   * Creates the Discord invite button.
   *
   * @returns Discord button element.
   */
  private createDiscordButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = "Henry's Tools Discord";
    button.title = HENRYS_TOOLS_DISCORD_URL;
    styleAboutActionButton(button, true);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openDiscordServer();
    });
    return button;
  }

  /**
   * Creates the footer Close button.
   *
   * @returns Close button element.
   */
  private createFooterCloseButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Close';
    styleAboutActionButton(button, false);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide();
    });
    return button;
  }

  /**
   * Creates a small uppercase section label.
   *
   * @param text Label text.
   * @returns Label element.
   */
  private createSectionLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.classList.add('about-dialog-section-label');
    label.textContent = text;
    label.style.fontSize = '11px';
    label.style.fontWeight = '700';
    label.style.letterSpacing = '0.1em';
    label.style.textTransform = 'uppercase';
    label.style.color = 'var(--about-accent)';
    return label;
  }

  /** Opens Henry's Tools Discord invite in a new browser tab. */
  private openDiscordServer(): void {
    window.open(HENRYS_TOOLS_DISCORD_URL, '_blank', 'noopener,noreferrer');
  }

  /**
   * Closes when the user presses Escape.
   *
   * @param event Keyboard event.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  }

  /**
   * Closes when the user clicks the dimmed backdrop outside the panel.
   *
   * @param event Pointer event on the backdrop.
   */
  private handleBackdropPointerDown(event: PointerEvent): void {
    if (event.target === this.backdrop) {
      this.hide();
    }
  }

  /** Re-triggers entrance animations when reopening the dialog. */
  private restartEntranceAnimation(): void {
    this.backdrop.classList.remove('about-dialog-backdrop');
    this.panel.classList.remove('about-dialog-panel');
    void this.backdrop.offsetWidth;
    this.backdrop.classList.add('about-dialog-backdrop');
    this.panel.classList.add('about-dialog-panel');
  }
}
