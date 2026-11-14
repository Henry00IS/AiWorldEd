/** Opens the AiWorldEd wiki from editor help controls. */
export class DocumentationLink {
  /** Public web address for the project wiki. */
  static readonly URL = 'https://github.com/Henry00IS/AiWorldEd/wiki';

  /** Opens the wiki in a separate browser tab without opener access. */
  open(): void {
    window.open(DocumentationLink.URL, '_blank', 'noopener,noreferrer');
  }
}
