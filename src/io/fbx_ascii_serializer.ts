import type { FbxExportPlan, FbxModelPlan } from './fbx_export_graph.js';
import type { FbxMeshPayload } from './fbx_mesh_payload.js';
import type { FbxMapRecord, FbxSurfaceRecord } from './fbx_surface_records.js';
import type { FbxObjectLink } from './fbx_node_id_pool.js';

const FBX_ASCII_VERSION = 7400;
const CREATOR_LABEL = 'AI World Editor';
const DOCUMENT_ID = 1000000000;

/**
 * Serializes an export plan into Autodesk FBX ASCII 7.4 text suitable for Unity
 * static mesh import (geometry, materials, external maps, hierarchy).
 */
export class FbxAsciiSerializer {
  /**
   * Builds the full ASCII document for a plan.
   *
   * @param plan Intermediate export plan.
   * @returns FBX ASCII text ending with a newline.
   */
  serialize(plan: FbxExportPlan): string {
    const sections = [
      this.writeFileBanner(),
      this.writeHeaderExtension(),
      this.writeGlobalSettings(plan),
      this.writeDocuments(),
      this.writeReferences(),
      this.writeDefinitions(plan),
      this.writeObjects(plan),
      this.writeConnections(plan.idPool.getLinks()),
      this.writeTakesPlaceholder(),
    ];
    return `${sections.join('\n')}\n`;
  }

  /**
   * Writes the semicolon comment banner at the top of the file.
   *
   * @returns Banner text.
   */
  private writeFileBanner(): string {
    return [
      '; FBX 7.4.0 project file',
      `; Created by ${CREATOR_LABEL}`,
      '; ----------------------------------------------------',
      '',
    ].join('\n');
  }

  /**
   * Writes FBXHeaderExtension.
   *
   * @returns Header section.
   */
  private writeHeaderExtension(): string {
    return [
      'FBXHeaderExtension:  {',
      '\tFBXHeaderVersion: 1004',
      `\tFBXVersion: ${FBX_ASCII_VERSION}`,
      '\tEncryptionType: 0',
      '\tCreationTimeStamp:  {',
      '\t\tVersion: 1000',
      '\t\tYear: 1970',
      '\t\tMonth: 1',
      '\t\tDay: 1',
      '\t\tHour: 0',
      '\t\tMinute: 0',
      '\t\tSecond: 0',
      '\t\tMillisecond: 0',
      '\t}',
      `\tCreator: "${CREATOR_LABEL}"`,
      '}',
      '',
    ].join('\n');
  }

  /**
   * Writes GlobalSettings with Y-up, Z-front, X-coord (Three.js-style axes) and
   * the plan's UnitScaleFactor (FBX system unit is centimeters).
   *
   * @param plan Export plan carrying unitScaleFactor.
   * @returns GlobalSettings section.
   */
  private writeGlobalSettings(plan: FbxExportPlan): string {
    const unitScale = this.formatNumber(plan.unitScaleFactor);
    const properties = [
      this.propertyLine('UpAxis', 'int', 'Integer', '', '1'),
      this.propertyLine('UpAxisSign', 'int', 'Integer', '', '1'),
      this.propertyLine('FrontAxis', 'int', 'Integer', '', '2'),
      this.propertyLine('FrontAxisSign', 'int', 'Integer', '', '1'),
      this.propertyLine('CoordAxis', 'int', 'Integer', '', '0'),
      this.propertyLine('CoordAxisSign', 'int', 'Integer', '', '1'),
      this.propertyLine('OriginalUpAxis', 'int', 'Integer', '', '1'),
      this.propertyLine('OriginalUpAxisSign', 'int', 'Integer', '', '1'),
      this.propertyLine('UnitScaleFactor', 'double', 'Number', '', unitScale),
      this.propertyLine('OriginalUnitScaleFactor', 'double', 'Number', '', unitScale),
    ];
    return [
      'GlobalSettings:  {',
      '\tVersion: 1000',
      '\tProperties70:  {',
      ...properties.map((line) => `\t\t${line}`),
      '\t}',
      '}',
      '',
    ].join('\n');
  }

  /**
   * Writes the Documents block with a single Scene document.
   *
   * @returns Documents section.
   */
  private writeDocuments(): string {
    return [
      'Documents:  {',
      '\tCount: 1',
      `\tDocument: ${DOCUMENT_ID}, "Scene", "Scene" {`,
      '\t\tProperties70:  {',
      `\t\t\t${this.propertyLine('SourceObject', 'object', '', '', '')}`,
      `\t\t\t${this.propertyLine('ActiveAnimStackName', 'KString', '', '', '""')}`,
      '\t\t}',
      '\t\tRootNode: 0',
      '\t}',
      '}',
      '',
    ].join('\n');
  }

  /**
   * Writes an empty References block required by many readers.
   *
   * @returns References section.
   */
  private writeReferences(): string {
    return ['References:  {', '}', ''].join('\n');
  }

  /**
   * Writes Definitions counts for each object type present in the plan.
   *
   * @param plan Export plan.
   * @returns Definitions section.
   */
  private writeDefinitions(plan: FbxExportPlan): string {
    const counts = this.countObjectTypes(plan);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const lines = ['Definitions:  {', '\tVersion: 100', `\tCount: ${total}`];
    for (const [typeName, count] of Object.entries(counts)) {
      if (count <= 0) continue;
      lines.push(`\tObjectType: "${typeName}" {`, `\t\tCount: ${count}`, '\t}');
    }
    lines.push('}', '');
    return lines.join('\n');
  }

  /**
   * Counts FBX object types present in the plan.
   *
   * @param plan Export plan.
   * @returns Map of type name to count.
   */
  private countObjectTypes(plan: FbxExportPlan): Record<string, number> {
    const geometryCount = plan.models.filter((model) => model.geometryId !== null).length;
    return {
      GlobalSettings: 1,
      Model: plan.models.length,
      Geometry: geometryCount,
      Material: plan.surfaces.getSurfaces().length,
      Texture: plan.surfaces.getMaps().length,
      Video: plan.surfaces.getMaps().length,
    };
  }

  /**
   * Writes the Objects block containing models, geometry, materials, and maps.
   *
   * @param plan Export plan.
   * @returns Objects section.
   */
  private writeObjects(plan: FbxExportPlan): string {
    const chunks: string[] = ['Objects:  {'];
    for (const model of plan.models) {
      chunks.push(this.writeModelObject(model));
      if (model.meshPayload && model.geometryId !== null) {
        chunks.push(this.writeGeometryObject(model.geometryId, model.name, model.meshPayload));
      }
    }
    for (const surface of plan.surfaces.getSurfaces()) {
      chunks.push(this.writeMaterialObject(surface));
    }
    for (const map of plan.surfaces.getMaps()) {
      chunks.push(this.writeTextureObject(map));
      chunks.push(this.writeVideoObject(map));
    }
    chunks.push('}', '');
    return chunks.join('\n');
  }

  /**
   * Writes one Model object.
   *
   * @param model Model plan.
   * @returns Model block text.
   */
  private writeModelObject(model: FbxModelPlan): string {
    const t = model.transform;
    const properties = [
      this.propertyLine('InheritType', 'enum', '', '', '1'),
      this.propertyLine('DefaultAttributeIndex', 'int', 'Integer', '', '0'),
      this.propertyTriple('Lcl Translation', 'Lcl Translation', '', 'A', t.translation),
      this.propertyTriple('Lcl Rotation', 'Lcl Rotation', '', 'A', t.rotationDegrees),
      this.propertyTriple('Lcl Scaling', 'Lcl Scaling', '', 'A', t.scale),
    ];
    return [
      `\tModel: ${model.modelId}, "Model::${escapeFbxString(model.name)}", "${model.modelKind}" {`,
      '\t\tVersion: 232',
      '\t\tProperties70:  {',
      ...properties.map((line) => `\t\t\t${line}`),
      '\t\t}',
      '\t\tShading: Y',
      '\t\tCulling: "CullingOff"',
      '\t}',
    ].join('\n');
  }

  /**
   * Writes one Geometry mesh object.
   *
   * @param geometryId Geometry object id.
   * @param name Display name.
   * @param payload Mesh payload.
   * @returns Geometry block text.
   */
  private writeGeometryObject(geometryId: number, name: string, payload: FbxMeshPayload): string {
    const lines = [
      `\tGeometry: ${geometryId}, "Geometry::${escapeFbxString(name)}", "Mesh" {`,
      this.writeArrayProperty('Vertices', payload.positions, 'd'),
      this.writeArrayProperty('PolygonVertexIndex', payload.polygonVertexIndex, 'i'),
      '\t\tGeometryVersion: 124',
    ];
    if (payload.cornerNormals.length > 0) {
      lines.push(...this.writeLayerElementNormal(payload.cornerNormals));
    }
    if (payload.cornerUvs.length > 0) {
      lines.push(...this.writeLayerElementUv(payload.cornerUvs));
    }
    lines.push(...this.writeLayerElementMaterial(payload));
    lines.push(...this.writeGeometryLayerSummary(payload));
    lines.push('\t}');
    return lines.join('\n');
  }

  /**
   * Writes LayerElementNormal Direct ByPolygonVertex.
   *
   * @param normals Flat corner normals.
   * @returns Indented lines.
   */
  private writeLayerElementNormal(normals: number[]): string[] {
    return [
      '\t\tLayerElementNormal: 0 {',
      '\t\t\tVersion: 101',
      '\t\t\tName: ""',
      '\t\t\tMappingInformationType: "ByPolygonVertex"',
      '\t\t\tReferenceInformationType: "Direct"',
      this.writeArrayProperty('Normals', normals, 'd', 3),
      '\t\t}',
    ];
  }

  /**
   * Writes LayerElementUV Direct ByPolygonVertex.
   *
   * @param uvs Flat corner UVs.
   * @returns Indented lines.
   */
  private writeLayerElementUv(uvs: number[]): string[] {
    return [
      '\t\tLayerElementUV: 0 {',
      '\t\t\tVersion: 101',
      '\t\t\tName: "UVMap"',
      '\t\t\tMappingInformationType: "ByPolygonVertex"',
      '\t\t\tReferenceInformationType: "Direct"',
      this.writeArrayProperty('UV', uvs, 'd', 3),
      '\t\t}',
    ];
  }

  /**
   * Writes LayerElementMaterial AllSame or ByPolygon.
   *
   * @param payload Mesh payload.
   * @returns Indented lines.
   */
  private writeLayerElementMaterial(payload: FbxMeshPayload): string[] {
    const multi = payload.polygonMaterialIndices.length > 0;
    const mapping = multi ? 'ByPolygon' : 'AllSame';
    const materials = multi ? payload.polygonMaterialIndices : [0];
    return [
      '\t\tLayerElementMaterial: 0 {',
      '\t\t\tVersion: 101',
      '\t\t\tName: ""',
      `\t\t\tMappingInformationType: "${mapping}"`,
      '\t\t\tReferenceInformationType: "IndexToDirect"',
      this.writeArrayProperty('Materials', materials, 'i', 3),
      '\t\t}',
    ];
  }

  /**
   * Writes the Layer summary listing present layer elements.
   *
   * @param payload Mesh payload.
   * @returns Indented lines.
   */
  private writeGeometryLayerSummary(payload: FbxMeshPayload): string[] {
    const elements: string[] = [];
    if (payload.cornerNormals.length > 0) {
      elements.push(this.writeLayerElementType('LayerElementNormal', 0));
    }
    if (payload.cornerUvs.length > 0) {
      elements.push(this.writeLayerElementType('LayerElementUV', 0));
    }
    elements.push(this.writeLayerElementType('LayerElementMaterial', 0));
    return ['\t\tLayer: 0 {', '\t\t\tVersion: 100', ...elements, '\t\t}'];
  }

  /**
   * Writes one LayerElement type entry inside Layer.
   *
   * @param typeName Layer element type name.
   * @param typedIndex Typed index.
   * @returns Indented block.
   */
  private writeLayerElementType(typeName: string, typedIndex: number): string {
    return [
      '\t\t\tLayerElement:  {',
      `\t\t\t\tType: "${typeName}"`,
      `\t\t\t\tTypedIndex: ${typedIndex}`,
      '\t\t\t}',
    ].join('\n');
  }

  /**
   * Writes one matte material for level-design export. Blender's FBX importer
   * converts Shininess with roughness = 1 - sqrt(Shininess)/10 (default
   * Shininess 20 if missing → glossy). Unity maps the same knobs into Standard
   * smoothness. We force fully-rough, zero-specular values and write scalars as
   * explicit floats so ASCII parsers keep FLOAT64 types (bare `0` can become
   * int).
   *
   * @param surface Surface record.
   * @returns Material block text.
   */
  private writeMaterialObject(surface: FbxSurfaceRecord): string {
    const color = surface.diffuseColor;
    const properties = [
      this.propertyTriple('DiffuseColor', 'Color', '', 'A', [color.r, color.g, color.b]),
      this.propertyLine('DiffuseFactor', 'Number', '', 'A', this.formatFloat(1)),
      this.propertyTriple('SpecularColor', 'Color', '', 'A', [0, 0, 0]),
      // Blender: specular = SpecularFactor * 2 → 0 keeps Principled specular off.
      this.propertyLine('SpecularFactor', 'Number', '', 'A', this.formatFloat(0)),
      // Blender: roughness = 1 - sqrt(Shininess)/10 → 0 shininess ⇒ roughness 1.
      this.propertyLine('Shininess', 'Number', '', 'A', this.formatFloat(0)),
      this.propertyLine('ShininessExponent', 'Number', '', 'A', this.formatFloat(0)),
      // Blender: metallic = ReflectionFactor.
      this.propertyLine('ReflectionFactor', 'Number', '', 'A', this.formatFloat(0)),
      this.propertyTriple('ReflectionColor', 'Color', '', 'A', [0, 0, 0]),
      this.propertyLine('Opacity', 'Number', '', 'A', this.formatFloat(surface.opacity)),
      // Extra PBR-style hints some Max/Arnold pipelines and ufbx understand.
      this.propertyLine('3dsMax|Parameters|roughness', 'Float', '', 'A', this.formatFloat(1)),
      this.propertyLine('3dsMax|Parameters|metalness', 'Float', '', 'A', this.formatFloat(0)),
    ];
    return [
      `\tMaterial: ${surface.materialId}, "Material::${escapeFbxString(surface.displayName)}", "" {`,
      '\t\tVersion: 102',
      '\t\tShadingModel: "phong"',
      '\t\tMultiLayer: 0',
      '\t\tProperties70:  {',
      ...properties.map((line) => `\t\t\t${line}`),
      '\t\t}',
      '\t}',
    ].join('\n');
  }

  /**
   * Formats a scalar so FBX ASCII stores it as a floating value (always has a
   * decimal point). Importers that type-check as FLOAT64 reject bare integers.
   *
   * @param value Number to format.
   * @returns ASCII float token such as "0.0" or "1.5".
   */
  private formatFloat(value: number): string {
    if (!Number.isFinite(value)) return '0.0';
    if (Number.isInteger(value)) return `${value}.0`;
    const fixed = value.toFixed(6).replace(/\.?0+$/, '');
    if (fixed.length === 0) return '0.0';
    return fixed.includes('.') ? fixed : `${fixed}.0`;
  }

  /**
   * Writes one Texture object pointing at an external file.
   *
   * @param map Map record.
   * @returns Texture block text.
   */
  private writeTextureObject(map: FbxMapRecord): string {
    return [
      `\tTexture: ${map.textureId}, "Texture::${escapeFbxString(map.displayName)}", "" {`,
      '\t\tType: "TextureVideoClip"',
      '\t\tVersion: 202',
      `\t\tTextureName: "Texture::${escapeFbxString(map.displayName)}"`,
      '\t\tProperties70:  {',
      `\t\t\t${this.propertyLine('CurrentTextureBlendMode', 'enum', '', '', '0')}`,
      `\t\t\t${this.propertyLine('UVSet', 'KString', '', '', '"UVMap"')}`,
      `\t\t\t${this.propertyLine('UseMaterial', 'bool', '', '', '1')}`,
      '\t\t}',
      `\t\tMedia: "Video::${escapeFbxString(map.displayName)}"`,
      `\t\tFileName: "${escapeFbxString(map.fileName)}"`,
      `\t\tRelativeFilename: "${escapeFbxString(map.fileName)}"`,
      '\t\tModelUVTranslation: 0,0',
      '\t\tModelUVScaling: 1,1',
      '\t\tTexture_Alpha_Source: "None"',
      '\t\tCropping: 0,0,0,0',
      '\t}',
    ].join('\n');
  }

  /**
   * Writes one Video media clip for an external texture file.
   *
   * @param map Map record.
   * @returns Video block text.
   */
  private writeVideoObject(map: FbxMapRecord): string {
    return [
      `\tVideo: ${map.videoId}, "Video::${escapeFbxString(map.displayName)}", "Clip" {`,
      '\t\tType: "Clip"',
      '\t\tProperties70:  {',
      `\t\t\t${this.propertyLine('Path', 'KString', 'XRefUrl', '', `"${escapeFbxString(map.fileName)}"`)}`,
      '\t\t}',
      '\t\tUseMipMap: 0',
      `\t\tFilename: "${escapeFbxString(map.fileName)}"`,
      `\t\tRelativeFilename: "${escapeFbxString(map.fileName)}"`,
      '\t}',
    ].join('\n');
  }

  /**
   * Writes the Connections block.
   *
   * @param links Object links from the id pool.
   * @returns Connections section.
   */
  private writeConnections(links: readonly FbxObjectLink[]): string {
    const lines = ['Connections:  {'];
    for (const link of links) {
      if (link.kind === 'OP' && link.propertyName) {
        lines.push(`\tC: "OP",${link.childId},${link.parentId},"${escapeFbxString(link.propertyName)}"`);
      } else {
        lines.push(`\tC: "OO",${link.childId},${link.parentId}`);
      }
    }
    lines.push('}', '');
    return lines.join('\n');
  }

  /**
   * Writes an empty Takes placeholder (no animation).
   *
   * @returns Takes section.
   */
  private writeTakesPlaceholder(): string {
    return ['Takes:  {', '\tCurrent: ""', '}', ''].join('\n');
  }

  /**
   * Formats a typed Properties70 scalar line.
   *
   * @param name Property name.
   * @param type Property type.
   * @param label Property label.
   * @param flags Property flags.
   * @param value Already-formatted value fragment (may include commas).
   * @returns P: line without leading tabs.
   */
  private propertyLine(name: string, type: string, label: string, flags: string, value: string): string {
    if (value.length === 0) {
      return `P: "${name}", "${type}", "${label}", "${flags}"`;
    }
    return `P: "${name}", "${type}", "${label}", "${flags}", ${value}`;
  }

  /**
   * Formats a Properties70 triple (vector/color) line.
   *
   * @param name Property name.
   * @param type Property type.
   * @param label Property label.
   * @param flags Property flags.
   * @param values Three numeric components.
   * @returns P: line without leading tabs.
   */
  private propertyTriple(
    name: string,
    type: string,
    label: string,
    flags: string,
    values: readonly [number, number, number] | number[],
  ): string {
    const formatted = values.map((value) => this.formatFloat(value)).join(',');
    return `P: "${name}", "${type}", "${label}", "${flags}",${formatted}`;
  }

  /**
   * Writes an FBX array property with length header and a: payload.
   *
   * @param name Array property name.
   * @param values Numeric values.
   * @param _dataType Reserved for binary parity (unused in ASCII).
   * @param indentLevel Tab depth for the property keyword (default 2).
   * @returns Indented multi-line array property.
   */
  private writeArrayProperty(name: string, values: readonly number[], _dataType: 'd' | 'i', indentLevel = 2): string {
    const indent = '\t'.repeat(indentLevel);
    const inner = '\t'.repeat(indentLevel + 1);
    const body = values.map((value) => this.formatNumber(value)).join(',');
    return [`${indent}${name}: *${values.length} {`, `${inner}a: ${body}`, `${indent}}`].join('\n');
  }

  /**
   * Formats a number for FBX ASCII (integers stay integers; floats trimmed).
   *
   * @param value Number to format.
   * @returns ASCII number token.
   */
  private formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (Number.isInteger(value)) return String(value);
    const fixed = value.toFixed(6).replace(/\.?0+$/, '');
    return fixed.length > 0 ? fixed : '0';
  }
}

/**
 * Escapes a string for inclusion inside FBX double quotes.
 *
 * @param value Raw string.
 * @returns Escaped string without surrounding quotes.
 */
function escapeFbxString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
