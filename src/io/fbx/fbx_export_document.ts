import type { FbxExportAxes, FbxExportPlan, FbxModelPlan } from './fbx_export_graph.js';
import type { FbxMeshPayload } from './fbx_mesh_payload.js';
import type { FbxMapRecord, FbxSurfaceRecord } from './fbx_surface_records.js';
import type { FbxObjectLink } from './fbx_node_id_pool.js';
import {
  fbxExportDouble,
  fbxExportInt,
  fbxExportLeaf,
  fbxExportLong,
  fbxExportNode,
  fbxExportObjectName,
  fbxExportProperty,
  fbxExportString,
  type FbxExportNode,
  type FbxExportValue,
} from './fbx_export_node.js';

/** FBX file version written by both encodings. */
export const FBX_EXPORT_VERSION = 7400;

/** Application name written as the file's creator. */
export const FBX_EXPORT_CREATOR = 'AI World Editor';

const DOCUMENT_ID = 1000000000;

/**
 * Builds the FBX 7.4 record tree for an export plan: header, global settings
 * with the plan's axes and units, definitions, objects (models, mesh geometry,
 * matte materials, external textures) and connections.
 *
 * @param plan Export plan.
 * @returns Top-level records in file order.
 */
export function fbxExportDocumentBuild(plan: FbxExportPlan): FbxExportNode[] {
  return [
    headerExtension(),
    globalSettings(plan.unitScaleFactor, plan.axes),
    documents(),
    fbxExportNode('References'),
    definitions(plan),
    objects(plan),
    connections(plan.idPool.getLinks()),
    fbxExportNode('Takes', [], [fbxExportLeaf('Current', fbxExportString(''))]),
  ];
}

/**
 * Builds FBXHeaderExtension.
 *
 * @returns Record.
 */
function headerExtension(): FbxExportNode {
  const stamp: [string, number][] = [
    ['Version', 1000],
    ['Year', 1970],
    ['Month', 1],
    ['Day', 1],
    ['Hour', 10],
    ['Minute', 0],
    ['Second', 0],
    ['Millisecond', 0],
  ];
  return fbxExportNode(
    'FBXHeaderExtension',
    [],
    [
      fbxExportLeaf('FBXHeaderVersion', fbxExportInt(1003)),
      fbxExportLeaf('FBXVersion', fbxExportInt(FBX_EXPORT_VERSION)),
      fbxExportLeaf('EncryptionType', fbxExportInt(0)),
      fbxExportNode(
        'CreationTimeStamp',
        [],
        stamp.map(([name, value]) => fbxExportLeaf(name, fbxExportInt(value))),
      ),
      fbxExportLeaf('Creator', fbxExportString(FBX_EXPORT_CREATOR)),
    ],
  );
}

/**
 * Builds GlobalSettings: the axis system of the file's data and the plan's
 * UnitScaleFactor (centimeters per file unit).
 *
 * @param unitScaleFactor Centimeters per file unit.
 * @param fileAxes Axis system of the file's data.
 * @returns Record.
 */
function globalSettings(unitScaleFactor: number, fileAxes: FbxExportAxes): FbxExportNode {
  const { up, front, coord } = fileAxes;
  const axes: [string, number][] = [
    ['UpAxis', up[0]],
    ['UpAxisSign', up[1]],
    ['FrontAxis', front[0]],
    ['FrontAxisSign', front[1]],
    ['CoordAxis', coord[0]],
    ['CoordAxisSign', coord[1]],
    ['OriginalUpAxis', up[0]],
    ['OriginalUpAxisSign', up[1]],
  ];
  return fbxExportNode(
    'GlobalSettings',
    [],
    [
      fbxExportLeaf('Version', fbxExportInt(1000)),
      properties70([
        ...axes.map(([name, value]) => fbxExportProperty(name, 'int', 'Integer', '', [fbxExportInt(value)])),
        fbxExportProperty('UnitScaleFactor', 'double', 'Number', '', [fbxExportDouble(unitScaleFactor)]),
        fbxExportProperty('OriginalUnitScaleFactor', 'double', 'Number', '', [fbxExportDouble(unitScaleFactor)]),
      ]),
    ],
  );
}

/**
 * Builds the Documents record with one Scene document.
 *
 * @returns Record.
 */
function documents(): FbxExportNode {
  const scene = fbxExportNode(
    'Document',
    [fbxExportLong(DOCUMENT_ID), fbxExportString('Scene'), fbxExportString('Scene')],
    [
      properties70([
        fbxExportProperty('SourceObject', 'object', '', ''),
        fbxExportProperty('ActiveAnimStackName', 'KString', '', '', [fbxExportString('')]),
      ]),
      fbxExportLeaf('RootNode', fbxExportLong(0)),
    ],
  );
  return fbxExportNode('Documents', [], [fbxExportLeaf('Count', fbxExportInt(1)), scene]);
}

/**
 * Builds Definitions with a count per object type present.
 *
 * @param plan Export plan.
 * @returns Record.
 */
function definitions(plan: FbxExportPlan): FbxExportNode {
  const maps = plan.surfaces.getMaps().length;
  const counts: [string, number][] = [
    ['GlobalSettings', 1],
    ['Model', plan.models.length],
    ['Geometry', plan.models.filter((model) => model.geometryId !== null).length],
    ['Material', plan.surfaces.getSurfaces().length],
    ['Texture', maps],
    ['Video', maps],
  ];
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  return fbxExportNode(
    'Definitions',
    [],
    [
      fbxExportLeaf('Version', fbxExportInt(100)),
      fbxExportLeaf('Count', fbxExportInt(total)),
      ...counts
        .filter(([, count]) => count > 0)
        .map(([type, count]) =>
          fbxExportNode('ObjectType', [fbxExportString(type)], [fbxExportLeaf('Count', fbxExportInt(count))]),
        ),
    ],
  );
}

/**
 * Builds the Objects record: models with their geometry, then materials, then
 * texture and video pairs.
 *
 * @param plan Export plan.
 * @returns Record.
 */
function objects(plan: FbxExportPlan): FbxExportNode {
  const records: FbxExportNode[] = [];
  for (const model of plan.models) {
    records.push(modelObject(model));
    if (model.meshPayload && model.geometryId !== null) {
      records.push(geometryObject(model.geometryId, model.name, model.meshPayload));
    }
  }
  plan.surfaces.getSurfaces().forEach((surface) => records.push(materialObject(surface)));
  plan.surfaces.getMaps().forEach((map) => records.push(textureObject(map), videoObject(map)));
  return fbxExportNode('Objects', [], records);
}

/**
 * Builds one Model object.
 *
 * @param model Model plan.
 * @returns Record.
 */
function modelObject(model: FbxModelPlan): FbxExportNode {
  const t = model.transform;
  return fbxExportNode(
    'Model',
    [fbxExportLong(model.modelId), fbxExportObjectName(model.name, 'Model'), fbxExportString(model.modelKind)],
    [
      fbxExportLeaf('Version', fbxExportInt(232)),
      properties70([
        fbxExportProperty('InheritType', 'enum', '', '', [fbxExportInt(1)]),
        fbxExportProperty('DefaultAttributeIndex', 'int', 'Integer', '', [fbxExportInt(0)]),
        vectorProperty('Lcl Translation', 'Lcl Translation', t.translation),
        vectorProperty('Lcl Rotation', 'Lcl Rotation', t.rotationDegrees),
        vectorProperty('Lcl Scaling', 'Lcl Scaling', t.scale),
      ]),
      fbxExportLeaf('Shading', { type: 'C', value: true }),
      fbxExportLeaf('Culling', fbxExportString('CullingOff')),
    ],
  );
}

/**
 * Builds one Geometry mesh object with normal, UV and material layers.
 *
 * @param geometryId Geometry object id.
 * @param name Display name.
 * @param payload Mesh payload.
 * @returns Record.
 */
function geometryObject(geometryId: number, name: string, payload: FbxMeshPayload): FbxExportNode {
  const multiMaterial = payload.polygonMaterialIndices.length > 0;
  const layers: FbxExportNode[] = [];
  const layerTypes: string[] = [];
  if (payload.cornerNormals.length > 0) {
    layers.push(
      layerElement('LayerElementNormal', '', 'ByPolygonVertex', 'Direct', 'Normals', payload.cornerNormals, 'd'),
    );
    layerTypes.push('LayerElementNormal');
  }
  if (payload.cornerUvs.length > 0) {
    layers.push(layerElement('LayerElementUV', 'UVMap', 'ByPolygonVertex', 'Direct', 'UV', payload.cornerUvs, 'd'));
    layerTypes.push('LayerElementUV');
  }
  layers.push(
    layerElement(
      'LayerElementMaterial',
      '',
      multiMaterial ? 'ByPolygon' : 'AllSame',
      'IndexToDirect',
      'Materials',
      multiMaterial ? payload.polygonMaterialIndices : [0],
      'i',
    ),
  );
  layerTypes.push('LayerElementMaterial');
  const layer = fbxExportNode(
    'Layer',
    [fbxExportInt(0)],
    [
      fbxExportLeaf('Version', fbxExportInt(100)),
      ...layerTypes.map((type) =>
        fbxExportNode(
          'LayerElement',
          [],
          [fbxExportLeaf('Type', fbxExportString(type)), fbxExportLeaf('TypedIndex', fbxExportInt(0))],
        ),
      ),
    ],
  );
  return fbxExportNode(
    'Geometry',
    [fbxExportLong(geometryId), fbxExportObjectName(name, 'Geometry'), fbxExportString('Mesh')],
    [
      fbxExportLeaf('Vertices', { type: 'd', value: payload.positions }),
      fbxExportLeaf('PolygonVertexIndex', { type: 'i', value: payload.polygonVertexIndex }),
      fbxExportLeaf('GeometryVersion', fbxExportInt(124)),
      ...layers,
      layer,
    ],
  );
}

/**
 * Builds one LayerElement record.
 *
 * @param record Record name such as LayerElementUV.
 * @param layerName Layer name.
 * @param mapping MappingInformationType.
 * @param reference ReferenceInformationType.
 * @param arrayName Data array record name.
 * @param values Data values.
 * @param arrayType Array type code.
 * @returns Record.
 */
function layerElement(
  record: string,
  layerName: string,
  mapping: string,
  reference: string,
  arrayName: string,
  values: readonly number[],
  arrayType: 'd' | 'i',
): FbxExportNode {
  return fbxExportNode(
    record,
    [fbxExportInt(0)],
    [
      fbxExportLeaf('Version', fbxExportInt(101)),
      fbxExportLeaf('Name', fbxExportString(layerName)),
      fbxExportLeaf('MappingInformationType', fbxExportString(mapping)),
      fbxExportLeaf('ReferenceInformationType', fbxExportString(reference)),
      fbxExportLeaf(arrayName, { type: arrayType, value: values }),
    ],
  );
}

/**
 * Builds one matte material for level-design export: zero specular, shininess
 * and reflection, so common FBX readers show a fully rough, non-metallic
 * surface.
 *
 * @param surface Surface record.
 * @returns Record.
 */
function materialObject(surface: FbxSurfaceRecord): FbxExportNode {
  const color = surface.diffuseColor;
  const number = (name: string, value: number, type = 'Number') =>
    fbxExportProperty(name, type, '', 'A', [fbxExportDouble(value)]);
  return fbxExportNode(
    'Material',
    [fbxExportLong(surface.materialId), fbxExportObjectName(surface.displayName, 'Material'), fbxExportString('')],
    [
      fbxExportLeaf('Version', fbxExportInt(102)),
      fbxExportLeaf('ShadingModel', fbxExportString('phong')),
      fbxExportLeaf('MultiLayer', fbxExportInt(0)),
      properties70([
        vectorProperty('DiffuseColor', 'Color', [color.r, color.g, color.b]),
        number('DiffuseFactor', 1),
        vectorProperty('SpecularColor', 'Color', [0, 0, 0]),
        // Zero specular so the surface reads matte.
        number('SpecularFactor', 0),
        // Zero shininess so readers treat the surface as fully rough.
        number('Shininess', 0),
        number('ShininessExponent', 0),
        // No reflection, so the surface is not metallic.
        number('ReflectionFactor', 0),
        vectorProperty('ReflectionColor', 'Color', [0, 0, 0]),
        number('Opacity', surface.opacity),
        // Extra PBR-style hints some Max/Arnold pipelines and ufbx understand.
        number('3dsMax|Parameters|roughness', 1, 'Float'),
        number('3dsMax|Parameters|metalness', 0, 'Float'),
      ]),
    ],
  );
}

/**
 * Builds one Texture object pointing at an external file.
 *
 * @param map Map record.
 * @returns Record.
 */
function textureObject(map: FbxMapRecord): FbxExportNode {
  return fbxExportNode(
    'Texture',
    [fbxExportLong(map.textureId), fbxExportObjectName(map.displayName, 'Texture'), fbxExportString('')],
    [
      fbxExportLeaf('Type', fbxExportString('TextureVideoClip')),
      fbxExportLeaf('Version', fbxExportInt(202)),
      fbxExportLeaf('TextureName', fbxExportObjectName(map.displayName, 'Texture')),
      properties70([
        fbxExportProperty('CurrentTextureBlendMode', 'enum', '', '', [fbxExportInt(0)]),
        fbxExportProperty('UVSet', 'KString', '', '', [fbxExportString('UVMap')]),
        fbxExportProperty('UseMaterial', 'bool', '', '', [fbxExportInt(1)]),
      ]),
      fbxExportLeaf('Media', fbxExportObjectName(map.displayName, 'Video')),
      fbxExportLeaf('FileName', fbxExportString(map.fileName)),
      fbxExportLeaf('RelativeFilename', fbxExportString(map.fileName)),
      fbxExportNode('ModelUVTranslation', [fbxExportDouble(0), fbxExportDouble(0)]),
      fbxExportNode('ModelUVScaling', [fbxExportDouble(1), fbxExportDouble(1)]),
      fbxExportLeaf('Texture_Alpha_Source', fbxExportString('None')),
      fbxExportNode('Cropping', [0, 0, 0, 0].map(fbxExportInt)),
    ],
  );
}

/**
 * Builds one Video clip: an external texture file, or an embedded image whose
 * bytes are the clip's Content.
 *
 * @param map Map record.
 * @returns Record.
 */
function videoObject(map: FbxMapRecord): FbxExportNode {
  const children = [
    fbxExportLeaf('Type', fbxExportString('Clip')),
    properties70([fbxExportProperty('Path', 'KString', 'XRefUrl', '', [fbxExportString(map.fileName)])]),
    fbxExportLeaf('UseMipMap', fbxExportInt(0)),
    fbxExportLeaf('Filename', fbxExportString(map.fileName)),
    fbxExportLeaf('RelativeFilename', fbxExportString(map.fileName)),
  ];
  if (map.content !== null) children.push(fbxExportLeaf('Content', { type: 'R', value: map.content }));
  return fbxExportNode(
    'Video',
    [fbxExportLong(map.videoId), fbxExportObjectName(map.displayName, 'Video'), fbxExportString('Clip')],
    children,
  );
}

/**
 * Builds the Connections record.
 *
 * @param links Object links.
 * @returns Record.
 */
function connections(links: readonly FbxObjectLink[]): FbxExportNode {
  return fbxExportNode(
    'Connections',
    [],
    links.map((link) => {
      const values: FbxExportValue[] = [
        fbxExportString(link.kind),
        fbxExportLong(link.childId),
        fbxExportLong(link.parentId),
      ];
      if (link.kind === 'OP' && link.propertyName) values.push(fbxExportString(link.propertyName));
      return fbxExportNode('C', values);
    }),
  );
}

/**
 * Wraps P entries in a Properties70 record.
 *
 * @param entries P records.
 * @returns Record.
 */
function properties70(entries: FbxExportNode[]): FbxExportNode {
  return fbxExportNode('Properties70', [], entries);
}

/**
 * Builds an animatable three-double property (vector or color).
 *
 * @param name Property name.
 * @param type Property type.
 * @param values Three components.
 * @returns P record.
 */
function vectorProperty(name: string, type: string, values: readonly number[]): FbxExportNode {
  return fbxExportProperty(name, type, '', 'A', values.map(fbxExportDouble));
}
