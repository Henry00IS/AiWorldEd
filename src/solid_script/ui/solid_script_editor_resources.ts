import { curveDrawThumbnail } from '@/curve/ui/curve_draw.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { modifierStackUiText, modifierStackUiTextButton } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import type { ProjectFileKind } from '@/project/fs/project_file_kind.js';
import type { ProjectFileRecord } from '@/project/scan/project_snapshot.js';
import { PanelProjectGrid } from '@/project/ui/panel_project_grid.js';
import type { SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResources,
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurveRead,
  solidScriptResourceCurve,
  solidScriptResourceFind,
  solidScriptResourceNameFree,
  solidScriptResourceNameValid,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptResourceTexturePreview } from '@/solid_script/document/solid_script_resource_texture.js';
import type { MenuContextItem } from '@/ui/menu/menu_context.js';
import {
  solidScriptEditorResourceDetail,
  type SolidScriptEditorResourceDetail,
} from './solid_script_editor_resource_detail.js';
import { solidScriptResourceDropAccepts, solidScriptResourceDropRead } from './solid_script_editor_resource_drop.js';

/**
 * Project file kind each resource kind shows as, so it gets the project's tile
 * look.
 */
const SOLID_SCRIPT_RESOURCE_TILE_KINDS: Readonly<Record<SolidScriptResource['kind'], ProjectFileKind>> = {
  Texture: 'texture',
  Curve: 'curve',
  Path: 'path',
};

/** Prefix of a resource tile's path: the name the script reads it by. */
const SOLID_SCRIPT_RESOURCE_TILE_PREFIX = '$Resources.';

/**
 * The Resources tab of the script editor: the textures, curves and paths kept
 * inside the script, shown like the project browser. Files dropped from the
 * project, the texture browser, a generator, the chat or the desktop are copied
 * in; the selected one is renamed and edited below the grid.
 */
export class SolidScriptEditorResources {
  /** Tab content. */
  readonly element = document.createElement('div');
  private readonly files: PanelProjectGrid;
  private readonly message = modifierStackUiText('div', '');
  private readonly details = document.createElement('div');
  private shown: SolidScriptEditorResourceDetail | null = null;
  private current: SolidScriptDocument | null = null;
  private chosen = '';

  /** @param commit Stores a changed script. */
  constructor(private readonly commit: (document: SolidScriptDocument) => void) {
    this.element.dataset['solidScriptResources'] = 'true';
    Object.assign(this.element.style, { display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 12px' });
    Object.assign(this.element.style, { height: '100%', minHeight: '0', boxSizing: 'border-box' });
    this.files = new PanelProjectGrid(
      {
        onActivate: (record) => this.choose(record, true),
        select: (record) => this.choose(record, false),
        thumbnail: (record) => this.thumbnail(record),
        menu: (record) => this.menu(record),
        key: (record, event) => event.key === 'Delete' && this.remove(this.nameOf(record)),
      },
      this.element,
    );
    Object.assign(this.files.host.style, { flex: '0 1 auto', minHeight: '120px' });
    const hint = modifierStackUiText(
      'div',
      'Drop textures, curves and paths here. The script reads each as [$Resources.Name].',
    );
    const add = modifierStackUiTextButton('New Curve', 'Add a new curve to the script', () => this.curveNew());
    Object.assign(add.style, { alignSelf: 'flex-start', flex: '0 0 auto', width: 'auto' });
    this.element.append(hint, add, this.files.host, this.message, this.details);
    this.dropBind();
  }

  /**
   * Shows the resources of a script.
   *
   * @param script Script.
   */
  write(script: SolidScriptDocument): void {
    this.current = script;
    const resources = solidScriptDocumentResources(script);
    if (resources.length === 0) this.files.empty('Drop textures, curves and paths here to copy them into the script.');
    else this.files.show(resources.map((resource) => this.tile(resource)));
    this.detailShow();
  }

  /**
   * Builds the tile of one resource.
   *
   * @param resource Resource.
   * @returns Tile.
   */
  private tile(resource: SolidScriptResource): HTMLElement {
    const tile = this.files.fileTile(solidScriptEditorResourceRecord(resource));
    tile.title = `[${SOLID_SCRIPT_RESOURCE_TILE_PREFIX}${resource.name}]`;
    return tile;
  }

  /**
   * Gives the preview of a resource tile: the texture, or the drawn curve.
   *
   * @param record Tile record.
   * @returns Image URL, or null.
   */
  private thumbnail(record: ProjectFileRecord): string | null {
    const resource = this.find(this.nameOf(record));
    if (resource?.kind === 'Texture') return solidScriptResourceTexturePreview(resource.textureId);
    const curve = resource?.kind === 'Curve' ? solidScriptResourceCurveRead(resource) : null;
    return curve ? curveDrawThumbnail(curve) : null;
  }

  /**
   * Gives the context menu of a resource tile.
   *
   * @param record Tile record.
   * @returns Rename and Remove.
   */
  private menu(record: ProjectFileRecord): MenuContextItem[] {
    const name = this.nameOf(record);
    return [
      { label: 'Rename', callback: () => (this.choose(record, false), this.shown?.rename()) },
      { label: 'Remove', callback: () => this.remove(name) },
    ];
  }

  /**
   * Selects a resource and shows its details; opening also opens its editor.
   *
   * @param record Tile record.
   * @param open True to open the curve editor.
   */
  private choose(record: ProjectFileRecord, open: boolean): void {
    this.chosen = this.nameOf(record);
    this.files.select(record.path);
    this.detailShow();
    if (open) this.shown?.open();
  }

  /** Shows the details of the selected resource, or none. */
  private detailShow(): void {
    const resource = this.find(this.chosen);
    this.shown = resource
      ? solidScriptEditorResourceDetail(resource, {
          change: (next) => this.replace(resource.name, next),
          rename: (name) => this.rename(resource, name),
        })
      : null;
    this.details.replaceChildren(...(this.shown ? [this.shown.element] : []));
  }

  /** Copies dropped files and curves into the script. */
  private dropBind(): void {
    const highlight = (on: boolean) => (this.files.host.style.outline = on ? '2px dashed currentColor' : '');
    for (const type of ['dragenter', 'dragover'] as const)
      this.element.addEventListener(type, (event) => {
        if (!solidScriptResourceDropAccepts(event.dataTransfer)) return;
        event.preventDefault();
        highlight(true);
      });
    this.element.addEventListener('dragleave', (event) => {
      if (!this.element.contains(event.relatedTarget as Node | null)) highlight(false);
    });
    this.element.addEventListener('drop', (event) => {
      highlight(false);
      if (!event.dataTransfer || !solidScriptResourceDropAccepts(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      void this.dropped(event.dataTransfer);
    });
  }

  /**
   * Adds the resources a drop carries and tells what did not fit.
   *
   * @param transfer Drop data.
   */
  private async dropped(transfer: DataTransfer): Promise<void> {
    const read = await solidScriptResourceDropRead(transfer, this.resources());
    const made = read.filter((entry): entry is SolidScriptResource => !('error' in entry));
    this.message.textContent = read.flatMap((entry) => ('error' in entry ? [entry.error] : [])).join(' ');
    if (made.length === 0) return;
    this.chosen = made.at(-1)!.name;
    this.change((resources) => [...resources, ...made]);
  }

  /** Adds a flat curve with a free name, selects it and opens its editor. */
  private curveNew(): void {
    const curve = curveFromPolyline([
      [0, 1],
      [1, 1],
    ]);
    const resource = solidScriptResourceCurve(solidScriptResourceNameFree(this.resources(), 'Curve'), curve);
    this.chosen = resource.name;
    this.change((resources) => [...resources, resource]);
    this.files.select(`${SOLID_SCRIPT_RESOURCE_TILE_PREFIX}${resource.name}`);
    this.shown?.open();
  }

  /**
   * Gives the resource name of a tile.
   *
   * @param record Tile record.
   * @returns Name.
   */
  private nameOf(record: ProjectFileRecord): string {
    return record.path.slice(SOLID_SCRIPT_RESOURCE_TILE_PREFIX.length);
  }

  /**
   * Lists the resources of the shown script.
   *
   * @returns Resources.
   */
  private resources(): SolidScriptResource[] {
    return this.current ? [...solidScriptDocumentResources(this.current)] : [];
  }

  /**
   * Finds a resource of the shown script by name.
   *
   * @param name Name.
   * @returns Resource, or null.
   */
  private find(name: string): SolidScriptResource | null {
    return name === '' ? null : (this.resources().find((resource) => resource.name === name) ?? null);
  }

  /**
   * Takes a resource out of the script.
   *
   * @param name Name.
   */
  private remove(name: string): void {
    this.replace(name, null);
  }

  /**
   * Stores the script with one resource replaced or taken out.
   *
   * @param name Name of the resource.
   * @param next Replacement, or null to take it out.
   */
  private replace(name: string, next: SolidScriptResource | null): void {
    if (next) this.chosen = next.name;
    this.change((resources) => resources.flatMap((entry) => (entry.name === name ? (next ? [next] : []) : [entry])));
  }

  /**
   * Stores the script with its resources changed.
   *
   * @param edit Changes the resources.
   */
  private change(edit: (resources: SolidScriptResource[]) => SolidScriptResource[]): void {
    if (this.current) this.commit(solidScriptDocumentResourcesWith(this.current, edit(this.resources())));
  }

  /**
   * Renames a resource when the name is valid and free.
   *
   * @param resource Resource.
   * @param name New name.
   * @returns Problem, or empty when renamed.
   */
  private rename(resource: SolidScriptResource, name: string): string {
    if (!solidScriptResourceNameValid(name))
      return 'A name starts with a letter and holds only letters, digits and _, such as Wall.';
    const taken = solidScriptResourceFind(this.resources(), name);
    if (taken && taken !== resource) return `Another resource is already called ${taken.name}.`;
    this.replace(resource.name, { ...resource, name });
    return '';
  }
}

/**
 * Describes a resource as a project file, so its tile looks like one.
 *
 * @param resource Resource.
 * @returns Record.
 */
function solidScriptEditorResourceRecord(resource: SolidScriptResource): ProjectFileRecord {
  const path = `${SOLID_SCRIPT_RESOURCE_TILE_PREFIX}${resource.name}`;
  const kind = SOLID_SCRIPT_RESOURCE_TILE_KINDS[resource.kind];
  return { path, name: resource.name, directory: '', kind, size: 0, lastModified: 0 };
}
