import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveDropBind } from '@/curve/ui/curve_drop.js';
import { modifierStackUiText, modifierStackUiTextButton } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { PATH_ASSET_DEFAULT } from '@/path/model/path_asset.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResources,
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceFind,
  solidScriptResourceNameFree,
  solidScriptResourceNameValid,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { TEXTURE_BROWSER_DRAG_TYPE, textureBrowserDragHas } from '@/texture/ui/browser/texture_browser_drag.js';
import { solidScriptEditorResourceRow } from './solid_script_editor_resource_row.js';

/**
 * The Resources tab of the script editor: the textures, curves and paths kept
 * with the script, each named so the script reads it as $Resource.Name. The
 * user edits them here; a run works on its own copy. Curves dropped from a
 * generator, the chat or the project, and textures dropped from the texture
 * browser, are added.
 */
export class SolidScriptEditorResources {
  /** Tab content. */
  readonly element = document.createElement('div');
  private readonly list = document.createElement('div');
  private current: SolidScriptDocument | null = null;

  /** @param commit Stores a changed script. */
  constructor(private readonly commit: (document: SolidScriptDocument) => void) {
    this.element.dataset['solidScriptResources'] = 'true';
    Object.assign(this.element.style, { display: 'grid', gap: '8px', padding: '8px 12px', alignContent: 'start' });
    const hint = modifierStackUiText('div', 'Read a resource in the script as [$Resource.Name].');
    const add = document.createElement('div');
    Object.assign(add.style, { display: 'flex', gap: '6px' });
    add.append(
      modifierStackUiTextButton('Add Curve', 'Add a curve resource', () => this.add('Curve')),
      modifierStackUiTextButton('Add Path', 'Add a path resource', () => this.add('Path')),
      modifierStackUiTextButton('Add Texture', 'Add a texture resource', () => this.add('Texture')),
    );
    this.element.append(hint, add, this.list);
    curveDropBind(this.element, (result) => {
      if ('curve' in result) this.added(solidScriptResourceCurve(this.nameFree(result.name || 'Curve'), result.curve));
    });
    this.element.addEventListener('dragover', (event) => {
      if (textureBrowserDragHas(event.dataTransfer)) event.preventDefault();
    });
    this.element.addEventListener('drop', (event) => this.textureDropped(event));
  }

  /**
   * Shows the resources of a script.
   *
   * @param script Script.
   */
  write(script: SolidScriptDocument): void {
    this.current = script;
    this.list.replaceChildren(...solidScriptDocumentResources(script).map((resource) => this.row(resource)));
  }

  /**
   * Adds a new resource of one kind with a free name.
   *
   * @param kind Kind.
   */
  private add(kind: SolidScriptResource['kind']): void {
    const name = this.nameFree(kind);
    if (kind === 'Texture') this.added({ name, kind, texture: '' });
    else if (kind === 'Path') this.added({ name, kind, path: PATH_ASSET_DEFAULT });
    else
      this.added(
        solidScriptResourceCurve(
          name,
          curveFromPolyline([
            [0, 1],
            [1, 1],
          ]),
        ),
      );
  }

  /**
   * Adds a texture dragged from the texture browser.
   *
   * @param event Drop.
   */
  private textureDropped(event: DragEvent): void {
    if (!textureBrowserDragHas(event.dataTransfer)) return;
    event.preventDefault();
    const texture = event.dataTransfer.getData(TEXTURE_BROWSER_DRAG_TYPE);
    if (texture !== '') this.added({ name: this.nameFree('Texture'), kind: 'Texture', texture });
  }

  /**
   * Gives a name no resource of the script has yet.
   *
   * @param base Wanted name.
   * @returns Free name.
   */
  private nameFree(base: string): string {
    return solidScriptResourceNameFree(this.current ? solidScriptDocumentResources(this.current) : [], base);
  }

  /**
   * Stores the script with one more resource.
   *
   * @param resource New resource.
   */
  private added(resource: SolidScriptResource): void {
    this.change((resources) => [...resources, resource]);
  }

  /**
   * Stores the script with its resources changed.
   *
   * @param edit Changes the resources.
   */
  private change(edit: (resources: SolidScriptResource[]) => SolidScriptResource[]): void {
    if (!this.current) return;
    this.commit(solidScriptDocumentResourcesWith(this.current, edit([...solidScriptDocumentResources(this.current)])));
  }

  /**
   * Builds the row of one resource.
   *
   * @param resource Resource.
   * @returns Row.
   */
  private row(resource: SolidScriptResource): HTMLElement {
    const replace = (next: SolidScriptResource | null) =>
      this.change((resources) =>
        resources.flatMap((entry) => (entry.name === resource.name ? (next ? [next] : []) : [entry])),
      );
    return solidScriptEditorResourceRow(resource, {
      change: (next) => replace(next),
      rename: (name) => this.rename(resource, name, replace),
      remove: () => replace(null),
    });
  }

  /**
   * Renames a resource when the name is valid and free.
   *
   * @param resource Resource.
   * @param name New name.
   * @param replace Stores the renamed resource.
   * @returns Problem, or empty when renamed.
   */
  private rename(resource: SolidScriptResource, name: string, replace: (next: SolidScriptResource) => void): string {
    if (!solidScriptResourceNameValid(name))
      return 'A name starts with a letter and holds only letters, digits and _, such as Wall.';
    const taken = solidScriptResourceFind(this.current ? solidScriptDocumentResources(this.current) : [], name);
    if (taken && taken !== resource) return `Another resource is already called ${taken.name}.`;
    replace({ ...resource, name });
    return '';
  }
}
