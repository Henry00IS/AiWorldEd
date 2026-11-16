import { modifierStackUiText } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import {
  solidScriptDocumentAuthorWith,
  solidScriptDocumentUsesWith,
  type SolidScriptDocument,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptInspectorUses } from './solid_script_inspector_row.js';

/**
 * The Settings tab of the script editor: Can Be Used As, the same switches as
 * the inspector, and who wrote the script.
 */
export class SolidScriptEditorSettings {
  /** Tab content. */
  readonly element = document.createElement('div');
  private readonly author = document.createElement('input');
  private readonly uses: { element: HTMLElement; write: (document: SolidScriptDocument) => void };
  private current: SolidScriptDocument | null = null;

  /**
   * Builds the tab.
   *
   * @param use How this step uses its script; that use stays on.
   * @param commit Stores a changed script.
   * @param notice Shows a short message.
   */
  constructor(
    use: SolidScriptUse,
    private readonly commit: (document: SolidScriptDocument) => void,
    notice: (text: string) => void,
  ) {
    this.element.dataset['solidScriptSettings'] = 'true';
    Object.assign(this.element.style, { display: 'grid', gap: '8px', padding: '8px 12px', alignContent: 'start' });
    this.uses = solidScriptInspectorUses(use, notice, (uses) =>
      this.change((script) => solidScriptDocumentUsesWith(script, uses)),
    );
    const row = document.createElement('label');
    row.title = 'Who wrote the script; saved with it';
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
    this.author.type = 'text';
    this.author.setAttribute('aria-label', 'Author');
    this.author.placeholder = 'Name';
    this.author.addEventListener('change', () =>
      this.change((script) => solidScriptDocumentAuthorWith(script, this.author.value)),
    );
    row.append(modifierStackUiText('span', 'Author', true), this.author);
    this.element.append(this.uses.element, row);
  }

  /**
   * Shows a script's settings; a field being typed in keeps its text.
   *
   * @param script Script.
   */
  write(script: SolidScriptDocument): void {
    this.current = script;
    this.uses.write(script);
    if (this.author.ownerDocument.activeElement !== this.author) this.author.value = script.author ?? '';
  }

  /**
   * Stores the shown script with one setting changed.
   *
   * @param edit Changes the script.
   */
  private change(edit: (script: SolidScriptDocument) => SolidScriptDocument): void {
    if (this.current) this.commit(edit(this.current));
  }
}
