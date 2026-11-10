import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { modelExportTexturePlace, type ModelExportTextures } from '@/io/export/model_export_textures.js';
import { ModelExportMaterialNames } from '@/io/export/model_export_material_names.js';
import { ModelExportTextureNames, modelExportTextureKey } from '@/io/export/model_export_texture_names.js';
import { modelExportWeldGeometry } from '@/io/export/model_export_weld.js';

/** One file a glTF export writes beside the .gltf. */
export interface GltfExportFile {
  /** Path relative to the .gltf, as it names it. */
  fileName: string;
  blob: Blob;
}

/** A .gltf export: the JSON text and the files it names. */
export interface GltfExportPackage {
  fileName: string;
  text: string;
  /** Buffer and image files (none when everything is embedded). */
  files: GltfExportFile[];
}

/** Image formats glTF allows without extensions. */
const GLTF_IMAGE_FORMATS: readonly string[] = ['png', 'jpg', 'jpeg'];

/** GLTFExporter's writer, as far as the texture plugin uses it. */
interface GltfWriter {
  json: {
    images?: { uri?: string; bufferView?: number; mimeType?: string; name?: string }[];
    textures?: { sampler: number; source: number; name?: string }[];
    bufferViews?: { byteLength: number }[];
    nodes?: { name?: string; mesh?: number }[];
    meshes?: { name?: string }[];
  };
  processSampler(map: THREE.Texture): number;
  processBufferViewImage(blob: Blob): Promise<number>;
}

/**
 * Exports the editor world as glTF 2.0: binary .glb with everything inside, or
 * .gltf JSON whose buffer and images are embedded as data URIs or written as
 * files. glTF always holds meters with +Y up (right-handed), so every program
 * converts it on import and no target conversion applies. Diffuse maps keep
 * their original image bytes (PNG or JPEG), with V flipped to glTF's top-left
 * texture origin.
 */
export class GlbExporter {
  /**
   * Exports the world as a .glb.
   *
   * @param worldGroup The live editor world root to export.
   * @returns GLB bytes.
   */
  async export(worldGroup: THREE.Group): Promise<ArrayBuffer> {
    const result = await this.parse(worldGroup, { mode: 'embedded' }, true, []);
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB export did not produce binary output');
    return result;
  }

  /**
   * Exports the world as a .gltf.
   *
   * @param worldGroup The live editor world root to export.
   * @param baseFileName Checked base name without extension.
   * @param textures Where the images go; the buffer is embedded too when they
   *   are, else written as "<base>.bin" beside the model.
   * @returns Package.
   */
  async exportGltf(
    worldGroup: THREE.Group,
    baseFileName: string,
    textures: ModelExportTextures,
  ): Promise<GltfExportPackage> {
    const files: GltfExportFile[] = [];
    const json = (await this.parse(worldGroup, textures, false, files)) as { buffers?: { uri?: string }[] };
    const buffer = json.buffers?.[0];
    if (textures.mode !== 'embedded' && buffer?.uri !== undefined) {
      const binName = `${baseFileName}.bin`;
      const bytes = await (await fetch(buffer.uri)).arrayBuffer();
      buffer.uri = binName;
      files.push({ fileName: binName, blob: new Blob([bytes], { type: 'application/octet-stream' }) });
    }
    return { fileName: `${baseFileName}.gltf`, text: JSON.stringify(json, null, 2), files };
  }

  /**
   * Runs GLTFExporter on an export copy of the world whose maps the texture
   * plugin writes.
   *
   * @param worldGroup World root.
   * @param textures Texture mode.
   * @param binary Whether to write a .glb.
   * @param files Receives image files.
   * @returns Exporter output.
   */
  private async parse(
    worldGroup: THREE.Group,
    textures: ModelExportTextures,
    binary: boolean,
    files: GltfExportFile[],
  ): Promise<ArrayBuffer | object> {
    const scene = new THREE.Scene();
    scene.add(...buildExportScene(worldGroup).children);
    const maps = gltfExportDetachMaps(scene);
    gltfExportWeld(scene);
    gltfExportNameMaterials(scene);
    const exporter = new GLTFExporter();
    exporter.register(
      (writer) => new GltfExportTexturePlugin(writer as unknown as GltfWriter, maps, textures, binary, files),
    );
    exporter.register((writer) => new GltfExportMeshNamesPlugin(writer as unknown as GltfWriter));
    return exporter.parseAsync(scene, { binary });
  }
}

/**
 * Takes the diffuse maps off the export copy's materials (the plugin writes
 * them) and flips V of every mesh's own copy of its UVs.
 *
 * @param scene Export copy.
 * @returns Map per material.
 */
function gltfExportDetachMaps(scene: THREE.Object3D): Map<THREE.Material, THREE.Texture> {
  const maps = new Map<THREE.Material, THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.map) maps.set(material, standard.map);
      standard.map = null;
    });
    const uv = (object.geometry as THREE.BufferGeometry).getAttribute('uv');
    if (uv === undefined) return;
    object.geometry = (object.geometry as THREE.BufferGeometry).clone();
    const flipped = object.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let index = 0; index < flipped.count; index++) flipped.setY(index, 1 - flipped.getY(index));
  });
  return maps;
}

/**
 * Names the export copy's materials as the FBX and OBJ exports do, so programs
 * do not list them as "Material.001" and so on. A material several meshes share
 * is named after the first.
 *
 * @param scene Export copy.
 */
function gltfExportNameMaterials(scene: THREE.Object3D): void {
  const names = new ModelExportMaterialNames('Material');
  const named = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material, index) => {
      if (named.has(material)) return;
      named.add(material);
      material.name = names.nameOf(material, object.name, index);
    });
  });
}

/**
 * Gives every mesh an indexed geometry in which corners identical in position,
 * normal, UV and every other attribute share a vertex. A glTF vertex has one
 * value per attribute, so corners on hard edges and UV seams stay separate.
 *
 * @param scene Export copy.
 */
function gltfExportWeld(scene: THREE.Object3D): void {
  const welded = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!welded.has(geometry)) welded.set(geometry, modelExportWeldGeometry(geometry));
    object.geometry = welded.get(geometry)!;
  });
}

/**
 * GLTFExporter plugin that writes each diffuse map once, where the mode puts
 * it.
 */
class GltfExportTexturePlugin {
  private readonly indices = new Map<string, Promise<number | null>>();
  private readonly names = new ModelExportTextureNames('texture');

  /**
   * @param writer GLTFExporter writer.
   * @param maps Diffuse map per material.
   * @param textures Texture mode.
   * @param binary Whether the output is a .glb.
   * @param files Receives image files.
   */
  constructor(
    private readonly writer: GltfWriter,
    private readonly maps: Map<THREE.Material, THREE.Texture>,
    private readonly textures: ModelExportTextures,
    private readonly binary: boolean,
    private readonly files: GltfExportFile[],
  ) {}

  /**
   * Adds the base color texture of a material.
   *
   * @param material Material.
   * @param materialDef GlTF material.
   */
  async writeMaterialAsync(
    material: THREE.Material,
    materialDef: { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } },
  ): Promise<void> {
    const map = this.maps.get(material);
    if (map === undefined) return;
    const key = modelExportTextureKey(map);
    let index = this.indices.get(key);
    if (index === undefined) {
      index = this.textureWrite(map, material);
      this.indices.set(key, index);
    }
    const textureIndex = await index;
    if (textureIndex === null) return;
    materialDef.pbrMetallicRoughness ??= {};
    materialDef.pbrMetallicRoughness.baseColorTexture = { index: textureIndex };
  }

  /**
   * Writes one texture and its image.
   *
   * @param map Texture.
   * @param material Material using it, for naming.
   * @returns Texture index, or null when the image cannot be read.
   */
  private async textureWrite(map: THREE.Texture, material: THREE.Material): Promise<number | null> {
    const name = this.names.stemOf(map, material);
    const placement = await modelExportTexturePlace(map, `${name}.png`, this.textures, GLTF_IMAGE_FORMATS);
    if (placement === null) return null;
    const json = this.writer.json;
    const image: { uri?: string; bufferView?: number; mimeType?: string; name: string } = { name };
    if (placement.kind === 'file') {
      image.uri = placement.path.split('/').map(encodeURIComponent).join('/');
      this.files.push({ fileName: placement.path, blob: placement.blob });
    } else {
      const mimeType = /\.jpe?g$/i.test(placement.fileName) ? 'image/jpeg' : 'image/png';
      if (this.binary) {
        image.bufferView = await this.writer.processBufferViewImage(placement.blob);
        // The writer counts its alignment padding in the view; the image is the file as is.
        json.bufferViews![image.bufferView]!.byteLength = placement.blob.size;
        image.mimeType = mimeType;
      } else
        image.uri = `data:${mimeType};base64,${gltfExportBase64(new Uint8Array(await placement.blob.arrayBuffer()))}`;
    }
    json.images ??= [];
    json.textures ??= [];
    const source = json.images.push(image) - 1;
    return json.textures.push({ sampler: this.writer.processSampler(map), source, name }) - 1;
  }
}

/**
 * Encodes bytes as base64.
 *
 * @param bytes Bytes.
 * @returns Base64 text.
 */
function gltfExportBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

/**
 * Names each glTF mesh after the first node that shows it (GLTFExporter leaves
 * meshes unnamed), so programs list the mesh data under the object's name.
 */
class GltfExportMeshNamesPlugin {
  /** @param writer GLTFExporter writer. */
  constructor(private readonly writer: GltfWriter) {}

  /** Copies node names onto their meshes once the file is built. */
  afterParse(): void {
    const meshes = this.writer.json.meshes ?? [];
    for (const node of this.writer.json.nodes ?? []) {
      const mesh = node.mesh === undefined ? undefined : meshes[node.mesh];
      if (mesh !== undefined && mesh.name === undefined && node.name !== undefined) mesh.name = node.name;
    }
  }
}
