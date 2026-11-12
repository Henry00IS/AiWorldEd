import { fbxImportBinaryDetect, FbxImportParserBinary } from './fbx_import_parser_binary.js';
import { FbxImportParserAscii } from './fbx_import_parser_ascii.js';
import { FbxImportNode, fbxImportIdKey } from './fbx_import_node.js';
import { FbxImportProperties } from './fbx_import_properties.js';

/** Oldest FBX version the importer reads (FBX 2011 and newer write 7.x). */
const FBX_IMPORT_VERSION_MINIMUM = 7000;

/** Id of the scene root in connections. */
export const FBX_IMPORT_ROOT_ID = '0';

/** One connection seen from one end. */
export interface FbxImportLink {
  /** Id of the object at the other end. */
  id: string;
  /** Property name of an object-property connection, or empty. */
  property: string;
}

/**
 * A parsed FBX file: its objects by id, the connections between them and its
 * global settings.
 */
export class FbxImportDocument {
  private readonly objectsById = new Map<string, FbxImportNode>();
  private readonly childLinks = new Map<string, FbxImportLink[]>();
  private readonly parentLinks = new Map<string, FbxImportLink[]>();
  /** Global settings (axes, unit scale). */
  readonly globalSettings: FbxImportProperties;

  /**
   * Indexes a record tree.
   *
   * @param records Top-level records.
   */
  constructor(records: readonly FbxImportNode[]) {
    const top = (name: string) => records.find((record) => record.name === name) ?? null;
    top('Objects')?.children.forEach((object) => this.objectAdd(object));
    top('Connections')
      ?.childrenNamed('C')
      .forEach((connection) => this.connectionAdd(connection));
    this.globalSettings = new FbxImportProperties(top('GlobalSettings'));
  }

  /**
   * Returns an object by id.
   *
   * @param id Object id.
   * @returns Object record, or null.
   */
  object(id: string): FbxImportNode | null {
    return this.objectsById.get(id) ?? null;
  }

  /**
   * Lists every object of a record type ("Model", "Geometry", ...).
   *
   * @param type Record name.
   * @returns Ids and records in file order.
   */
  objectsOfType(type: string): { id: string; node: FbxImportNode }[] {
    return [...this.objectsById].filter(([, node]) => node.name === type).map(([id, node]) => ({ id, node }));
  }

  /**
   * Lists the objects connected below an object, in connection order.
   *
   * @param id Parent id.
   * @returns Links to children.
   */
  childrenOf(id: string): readonly FbxImportLink[] {
    return this.childLinks.get(id) ?? [];
  }

  /**
   * Lists the objects an object is connected below.
   *
   * @param id Child id.
   * @returns Links to parents.
   */
  parentsOf(id: string): readonly FbxImportLink[] {
    return this.parentLinks.get(id) ?? [];
  }

  /**
   * Registers one object record.
   *
   * @param object Object record.
   */
  private objectAdd(object: FbxImportNode): void {
    const id = fbxImportIdKey(object.properties[0]);
    if (id !== null) this.objectsById.set(id, object);
  }

  /**
   * Registers one "C:" connection record (kind, child id, parent id, property).
   *
   * @param connection Connection record.
   */
  private connectionAdd(connection: FbxImportNode): void {
    const [, childValue, parentValue, propertyValue] = connection.properties;
    const child = fbxImportIdKey(childValue);
    const parent = fbxImportIdKey(parentValue);
    if (child === null || parent === null) return;
    const property = typeof propertyValue === 'string' ? propertyValue : '';
    fbxImportLinkPush(this.childLinks, parent, { id: child, property });
    fbxImportLinkPush(this.parentLinks, child, { id: parent, property });
  }
}

/**
 * Appends a link to a list map.
 *
 * @param links Links by object id.
 * @param id Object id.
 * @param link Link.
 */
function fbxImportLinkPush(links: Map<string, FbxImportLink[]>, id: string, link: FbxImportLink): void {
  const list = links.get(id);
  if (list === undefined) links.set(id, [link]);
  else list.push(link);
}

/**
 * Parses FBX bytes (binary or ASCII) into a document.
 *
 * @param data File bytes.
 * @returns Document; throws for files that are not FBX 7.x.
 */
export function fbxImportDocumentParse(data: ArrayBuffer | ArrayBufferView): FbxImportDocument {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (fbxImportBinaryDetect(bytes)) {
    const parsed = new FbxImportParserBinary().parse(bytes);
    fbxImportVersionCheck(parsed.version);
    return new FbxImportDocument(parsed.records);
  }
  const records = new FbxImportParserAscii().parse(new TextDecoder().decode(bytes));
  fbxImportVersionCheck(fbxImportAsciiVersion(records));
  return new FbxImportDocument(records);
}

/**
 * Reads the version of an ASCII file from its header extension.
 *
 * @param records Top-level records.
 * @returns Version, or 0 when the file has no FBX header.
 */
function fbxImportAsciiVersion(records: readonly FbxImportNode[]): number {
  const header = records.find((record) => record.name === 'FBXHeaderExtension');
  return header?.childNumber('FBXVersion') ?? 0;
}

/**
 * Rejects files older than FBX 7 or without an FBX header.
 *
 * @param version File version.
 */
function fbxImportVersionCheck(version: number): void {
  if (version === 0) throw new Error('not an FBX file');
  if (version < FBX_IMPORT_VERSION_MINIMUM) {
    const major = Math.floor(version / 1000);
    throw new Error(`FBX ${major}.x files are not supported; re-export as FBX 2011 (7.x) or newer`);
  }
}
