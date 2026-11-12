import { zlibSync } from 'three/addons/libs/fflate.module.js';

/** One typed property value of a fixture record. */
export type FbxFixtureValue =
  | { type: 'I' | 'L' | 'D'; value: number }
  | { type: 'S'; value: string }
  | { type: 'R'; value: Uint8Array }
  | { type: 'd' | 'i'; value: readonly number[] };

/** One fixture record. */
export interface FbxFixtureRecord {
  name: string;
  properties: FbxFixtureValue[];
  children: FbxFixtureRecord[];
}

/** One model of a fixture scene. */
export interface FbxFixtureModel {
  id: number;
  name: string;
  parent: number;
  kind?: 'Mesh' | 'Null';
  properties?: FbxFixtureRecord[];
  geometry?: number;
  materials?: number[];
}

/** One UV set of a fixture geometry. */
export interface FbxFixtureUv {
  mapping: 'ByPolygonVertex' | 'ByControlPoint';
  reference: 'Direct' | 'IndexToDirect';
  values: number[];
  indices?: number[];
}

/** One mesh geometry of a fixture scene. */
export interface FbxFixtureGeometry {
  id: number;
  vertices: number[];
  polygons: number[][];
  uv?: FbxFixtureUv;
  polygonMaterials?: number[];
}

/** One material, optionally with a diffuse texture. */
export interface FbxFixtureMaterial {
  id: number;
  name: string;
  texture?: { id: number; videoId: number; name: string; file: string; content?: Uint8Array };
}

/** Content of a fixture scene. */
export interface FbxFixtureScene {
  models: FbxFixtureModel[];
  geometries: FbxFixtureGeometry[];
  materials?: FbxFixtureMaterial[];
  axes?: { up: [number, number]; front: [number, number]; coord: [number, number] };
  unitScaleFactor?: number;
}

/**
 * Creates a record.
 *
 * @param name Name.
 * @param properties Properties.
 * @param children Children.
 * @returns Record.
 */
export function fbxFixtureRecord(
  name: string,
  properties: FbxFixtureValue[] = [],
  children: FbxFixtureRecord[] = [],
): FbxFixtureRecord {
  return { name, properties, children };
}

/**
 * Creates a "P:" property record with number values.
 *
 * @param name Property name.
 * @param type Property type ("Lcl Translation", "int", ...).
 * @param values Number values.
 * @returns Record.
 */
export function fbxFixtureProperty(name: string, type: string, values: readonly number[]): FbxFixtureRecord {
  const head: FbxFixtureValue[] = [name, type, '', 'A'].map((value) => ({ type: 'S', value }));
  const integer = type === 'int' || type === 'enum' || type === 'bool';
  return fbxFixtureRecord('P', [...head, ...values.map((value) => ({ type: integer ? 'I' : 'D', value }) as const)]);
}

/**
 * Builds the top-level records of a fixture scene.
 *
 * @param scene Scene content.
 * @returns Records.
 */
export function fbxFixtureSceneRecords(scene: FbxFixtureScene): FbxFixtureRecord[] {
  const objects = [
    ...scene.models.map(fbxFixtureModelRecord),
    ...scene.geometries.map(fbxFixtureGeometryRecord),
    ...(scene.materials ?? []).flatMap(fbxFixtureMaterialRecords),
  ];
  return [
    fbxFixtureRecord('FBXHeaderExtension', [], [fbxFixtureRecord('FBXVersion', [{ type: 'I', value: 7400 }])]),
    fbxFixtureRecord('GlobalSettings', [], [fbxFixtureRecord('Properties70', [], fbxFixtureGlobalProperties(scene))]),
    fbxFixtureRecord('Objects', [], objects),
    fbxFixtureRecord('Connections', [], fbxFixtureConnections(scene)),
  ];
}

/**
 * Builds the global settings properties.
 *
 * @param scene Scene content.
 * @returns Property records.
 */
function fbxFixtureGlobalProperties(scene: FbxFixtureScene): FbxFixtureRecord[] {
  const axes = scene.axes ?? { up: [1, 1], front: [2, 1], coord: [0, 1] };
  return [
    fbxFixtureProperty('UpAxis', 'int', [axes.up[0]]),
    fbxFixtureProperty('UpAxisSign', 'int', [axes.up[1]]),
    fbxFixtureProperty('FrontAxis', 'int', [axes.front[0]]),
    fbxFixtureProperty('FrontAxisSign', 'int', [axes.front[1]]),
    fbxFixtureProperty('CoordAxis', 'int', [axes.coord[0]]),
    fbxFixtureProperty('CoordAxisSign', 'int', [axes.coord[1]]),
    fbxFixtureProperty('UnitScaleFactor', 'double', [scene.unitScaleFactor ?? 100]),
  ];
}

/**
 * Builds a model record.
 *
 * @param model Model.
 * @returns Record.
 */
function fbxFixtureModelRecord(model: FbxFixtureModel): FbxFixtureRecord {
  return fbxFixtureRecord(
    'Model',
    [
      { type: 'L', value: model.id },
      { type: 'S', value: `${model.name}\u0000\u0001Model` },
      { type: 'S', value: model.kind ?? 'Mesh' },
    ],
    [fbxFixtureRecord('Properties70', [], model.properties ?? [])],
  );
}

/**
 * Builds a geometry record with its UV and material layers.
 *
 * @param geometry Geometry.
 * @returns Record.
 */
function fbxFixtureGeometryRecord(geometry: FbxFixtureGeometry): FbxFixtureRecord {
  const polygonVertexIndex = geometry.polygons.flatMap((polygon) =>
    polygon.map((vertex, corner) => (corner === polygon.length - 1 ? -vertex - 1 : vertex)),
  );
  const children = [
    fbxFixtureRecord('Vertices', [{ type: 'd', value: geometry.vertices }]),
    fbxFixtureRecord('PolygonVertexIndex', [{ type: 'i', value: polygonVertexIndex }]),
  ];
  if (geometry.uv !== undefined) children.push(fbxFixtureUvRecord(geometry.uv));
  if (geometry.polygonMaterials !== undefined) children.push(fbxFixtureMaterialLayer(geometry.polygonMaterials));
  return fbxFixtureRecord(
    'Geometry',
    [
      { type: 'L', value: geometry.id },
      { type: 'S', value: 'Geometry\u0000\u0001Geometry' },
      { type: 'S', value: 'Mesh' },
    ],
    children,
  );
}

/**
 * Builds a UV layer element.
 *
 * @param uv UV set.
 * @returns Record.
 */
function fbxFixtureUvRecord(uv: FbxFixtureUv): FbxFixtureRecord {
  const children = [
    fbxFixtureRecord('MappingInformationType', [{ type: 'S', value: uv.mapping }]),
    fbxFixtureRecord('ReferenceInformationType', [{ type: 'S', value: uv.reference }]),
    fbxFixtureRecord('UV', [{ type: 'd', value: uv.values }]),
  ];
  if (uv.indices !== undefined) children.push(fbxFixtureRecord('UVIndex', [{ type: 'i', value: uv.indices }]));
  return fbxFixtureRecord('LayerElementUV', [{ type: 'I', value: 0 }], children);
}

/**
 * Builds a by-polygon material layer element.
 *
 * @param polygonMaterials Material slot per polygon.
 * @returns Record.
 */
function fbxFixtureMaterialLayer(polygonMaterials: readonly number[]): FbxFixtureRecord {
  return fbxFixtureRecord(
    'LayerElementMaterial',
    [{ type: 'I', value: 0 }],
    [
      fbxFixtureRecord('MappingInformationType', [{ type: 'S', value: 'ByPolygon' }]),
      fbxFixtureRecord('ReferenceInformationType', [{ type: 'S', value: 'IndexToDirect' }]),
      fbxFixtureRecord('Materials', [{ type: 'i', value: polygonMaterials }]),
    ],
  );
}

/**
 * Builds the material, texture and video records of a material.
 *
 * @param material Material.
 * @returns Records.
 */
function fbxFixtureMaterialRecords(material: FbxFixtureMaterial): FbxFixtureRecord[] {
  const label = (name: string, type: string): FbxFixtureValue => ({ type: 'S', value: `${name}\u0000\u0001${type}` });
  const records = [
    fbxFixtureRecord('Material', [
      { type: 'L', value: material.id },
      label(material.name, 'Material'),
      { type: 'S', value: '' },
    ]),
  ];
  const texture = material.texture;
  if (texture === undefined) return records;
  const file = (name: string) => fbxFixtureRecord(name, [{ type: 'S', value: texture.file }]);
  const textureRecord = fbxFixtureRecord(
    'Texture',
    [{ type: 'L', value: texture.id }, label(texture.name, 'Texture'), { type: 'S', value: '' }],
    [file('FileName'), file('RelativeFilename')],
  );
  const videoChildren = [file('RelativeFilename')];
  if (texture.content !== undefined)
    videoChildren.push(fbxFixtureRecord('Content', [{ type: 'R', value: texture.content }]));
  const video = fbxFixtureRecord(
    'Video',
    [{ type: 'L', value: texture.videoId }, label(texture.name, 'Video'), { type: 'S', value: 'Clip' }],
    videoChildren,
  );
  return [...records, textureRecord, video];
}

/**
 * Builds the connections of a fixture scene.
 *
 * @param scene Scene content.
 * @returns Connection records.
 */
function fbxFixtureConnections(scene: FbxFixtureScene): FbxFixtureRecord[] {
  const link = (child: number, parent: number, property?: string) =>
    fbxFixtureRecord('C', [
      { type: 'S', value: property === undefined ? 'OO' : 'OP' },
      { type: 'L', value: child },
      { type: 'L', value: parent },
      ...(property === undefined ? [] : [{ type: 'S', value: property } as const]),
    ]);
  const links = scene.models.flatMap((model) => [
    link(model.id, model.parent),
    ...(model.geometry === undefined ? [] : [link(model.geometry, model.id)]),
    ...(model.materials ?? []).map((material) => link(material, model.id)),
  ]);
  const textureLinks = (scene.materials ?? []).flatMap((material) =>
    material.texture === undefined
      ? []
      : [link(material.texture.id, material.id, 'DiffuseColor'), link(material.texture.videoId, material.texture.id)],
  );
  return [...links, ...textureLinks];
}

/**
 * Encodes records as ASCII FBX text.
 *
 * @param records Top-level records.
 * @returns Text.
 */
export function fbxFixtureEncodeAscii(records: readonly FbxFixtureRecord[]): Uint8Array {
  const lines = ['; FBX 7.4.0 project file', ...records.flatMap((record) => fbxFixtureAsciiRecord(record, ''))];
  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}

/**
 * Encodes one record as ASCII lines.
 *
 * @param record Record.
 * @param indent Indentation.
 * @returns Lines.
 */
function fbxFixtureAsciiRecord(record: FbxFixtureRecord, indent: string): string[] {
  const array = record.properties.find((value) => value.type === 'd' || value.type === 'i');
  if (array !== undefined && Array.isArray(array.value)) {
    return [
      `${indent}${record.name}: *${array.value.length} {`,
      `${indent}\ta: ${array.value.join(',')}`,
      `${indent}}`,
    ];
  }
  const values = record.properties.map(fbxFixtureAsciiValue).join(', ');
  if (record.children.length === 0) return [`${indent}${record.name}: ${values}`];
  const children = record.children.flatMap((child) => fbxFixtureAsciiRecord(child, `${indent}\t`));
  return [`${indent}${record.name}: ${values} {`, ...children, `${indent}}`];
}

/**
 * Encodes one scalar value as ASCII (labels in "Class::Name" form).
 *
 * @param value Value.
 * @returns Text.
 */
function fbxFixtureAsciiValue(value: FbxFixtureValue): string {
  if (value.type === 'R') return `"${btoa(String.fromCharCode(...value.value))}"`;
  if (value.type !== 'S') return String(value.value);
  const [name, type] = value.value.split('\u0000\u0001');
  const text = type === undefined ? value.value : `${type}::${name}`;
  return `"${text.replaceAll('"', '&quot;')}"`;
}

/**
 * Encodes records as binary FBX.
 *
 * @param records Top-level records.
 * @param version File version (7500 and newer use 64-bit headers).
 * @param compress Compress arrays with zlib.
 * @returns Bytes.
 */
export function fbxFixtureEncodeBinary(
  records: readonly FbxFixtureRecord[],
  version = 7400,
  compress = false,
): Uint8Array {
  const writer = new FbxFixtureBinaryWriter(version >= 7500, compress);
  writer.bytes(new TextEncoder().encode('Kaydara FBX Binary  \u0000'));
  writer.bytes(new Uint8Array([0x1a, 0]));
  writer.uint32(version);
  records.forEach((record) => writer.record(record));
  writer.nullRecord();
  writer.bytes(new Uint8Array(160));
  return writer.result();
}

/** Growing binary FBX writer for fixtures. */
class FbxFixtureBinaryWriter {
  private readonly chunks: number[] = [];

  /**
   * Creates a writer.
   *
   * @param wide Use 64-bit record headers.
   * @param compress Compress arrays.
   */
  constructor(
    private readonly wide: boolean,
    private readonly compress: boolean,
  ) {}

  /**
   * Returns the bytes written.
   *
   * @returns Bytes.
   */
  result(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  /**
   * Appends bytes.
   *
   * @param bytes Bytes.
   */
  bytes(bytes: Uint8Array): void {
    bytes.forEach((byte) => this.chunks.push(byte));
  }

  /**
   * Appends a little-endian value.
   *
   * @param size Byte size.
   * @param write Writes the value into a view.
   */
  value(size: number, write: (view: DataView) => void): void {
    const view = new DataView(new ArrayBuffer(size));
    write(view);
    this.bytes(new Uint8Array(view.buffer));
  }

  /**
   * Appends an unsigned 32-bit integer.
   *
   * @param value Value.
   */
  uint32(value: number): void {
    this.value(4, (view) => view.setUint32(0, value, true));
  }

  /**
   * Appends a header field (32 or 64-bit).
   *
   * @param value Value.
   */
  headerField(value: number): void {
    if (this.wide) this.value(8, (view) => view.setBigUint64(0, BigInt(value), true));
    else this.uint32(value);
  }

  /** Appends a null record. */
  nullRecord(): void {
    this.bytes(new Uint8Array(this.wide ? 25 : 13));
  }

  /**
   * Appends a record, patching its end offset afterwards.
   *
   * @param record Record.
   */
  record(record: FbxFixtureRecord): void {
    const start = this.chunks.length;
    [0, record.properties.length, 0].forEach((field) => this.headerField(field));
    this.bytes(new Uint8Array([record.name.length]));
    this.bytes(new TextEncoder().encode(record.name));
    const propertiesStart = this.chunks.length;
    record.properties.forEach((property) => this.property(property));
    this.patch(start + (this.wide ? 16 : 8), this.chunks.length - propertiesStart);
    record.children.forEach((child) => this.record(child));
    if (record.children.length > 0) this.nullRecord();
    this.patch(start, this.chunks.length);
  }

  /**
   * Overwrites a header field.
   *
   * @param offset Field offset.
   * @param value Value.
   */
  patch(offset: number, value: number): void {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(value), true);
    for (let index = 0; index < (this.wide ? 8 : 4); index++) this.chunks[offset + index] = view.getUint8(index);
  }

  /**
   * Appends one typed property.
   *
   * @param property Property.
   */
  property(property: FbxFixtureValue): void {
    this.bytes(new Uint8Array([property.type.charCodeAt(0)]));
    switch (property.type) {
      case 'I':
        this.value(4, (view) => view.setInt32(0, property.value, true));
        break;
      case 'L':
        this.value(8, (view) => view.setBigInt64(0, BigInt(property.value), true));
        break;
      case 'D':
        this.value(8, (view) => view.setFloat64(0, property.value, true));
        break;
      case 'S':
        this.sized(new TextEncoder().encode(property.value));
        break;
      case 'R':
        this.sized(property.value);
        break;
      default:
        this.array(property.type, property.value);
    }
  }

  /**
   * Appends length-prefixed bytes.
   *
   * @param bytes Bytes.
   */
  sized(bytes: Uint8Array): void {
    this.uint32(bytes.length);
    this.bytes(bytes);
  }

  /**
   * Appends an array property.
   *
   * @param type Array type.
   * @param values Values.
   */
  array(type: 'd' | 'i', values: readonly number[]): void {
    const size = type === 'd' ? 8 : 4;
    const view = new DataView(new ArrayBuffer(values.length * size));
    values.forEach((value, index) =>
      type === 'd' ? view.setFloat64(index * 8, value, true) : view.setInt32(index * 4, value, true),
    );
    const raw = new Uint8Array(view.buffer);
    const stored = this.compress ? zlibSync(raw) : raw;
    [values.length, this.compress ? 1 : 0, stored.length].forEach((field) => this.uint32(field));
    this.bytes(stored);
  }
}
