import { MeshAttributeStore } from '@/mesh/attribute/mesh_attribute_store.js';
import { MeshTopology } from '@/mesh/topology/mesh_topology.js';
import { MeshDocumentDirtyFlags } from './mesh_document_dirty_flags.js';

/** Next identity assigned to a newly constructed document. */
let nextMeshDocumentIdentity = 1;

/**
 * Editable mesh document: topology is source of truth, attributes hang off
 * faces and face-corners, generation bumps when derived buffers must rebuild.
 */
export class MeshDocument {
  private topology: MeshTopology;
  private attributes: MeshAttributeStore;
  private dirtyFlags: MeshDocumentDirtyFlags;
  private geometryGeneration: number;
  private topologyGeneration: number;
  private readonly documentIdentity: number;

  /**
   * Creates a document from topology and optional attributes.
   *
   * @param topology Mesh topology.
   * @param attributes Optional attribute store; sized to topology when omitted.
   */
  constructor(topology: MeshTopology, attributes?: MeshAttributeStore) {
    this.topology = topology;
    this.attributes = attributes ?? new MeshAttributeStore(topology.getHalfEdgeCount(), topology.getFaceCount());
    this.attributes.ensureTopologySizes(topology.getHalfEdgeCount(), topology.getFaceCount());
    this.dirtyFlags = new MeshDocumentDirtyFlags();
    this.geometryGeneration = 1;
    this.topologyGeneration = 1;
    this.documentIdentity = nextMeshDocumentIdentity;
    nextMeshDocumentIdentity += 1;
    this.dirtyFlags.markTopologyDirty();
    this.dirtyFlags.markPositionsDirty();
    this.dirtyFlags.markAttributesDirty();
  }

  /**
   * Returns the live topology.
   *
   * @returns Mesh topology.
   */
  getTopology(): MeshTopology {
    return this.topology;
  }

  /**
   * Returns the live attribute store.
   *
   * @returns Attribute store.
   */
  getAttributes(): MeshAttributeStore {
    return this.attributes;
  }

  /**
   * Returns the current geometry generation counter.
   *
   * @returns Generation number.
   */
  getGeometryGeneration(): number {
    return this.geometryGeneration;
  }

  /**
   * Returns the topology generation. Position edits do not change it.
   *
   * @returns Topology generation number.
   */
  getTopologyGeneration(): number {
    return this.topologyGeneration;
  }

  /**
   * Returns the identity assigned when this document was constructed.
   *
   * @returns Document identity.
   */
  getDocumentIdentity(): number {
    return this.documentIdentity;
  }

  /**
   * Returns dirty flags for presentation.
   *
   * @returns Dirty flags.
   */
  getDirtyFlags(): MeshDocumentDirtyFlags {
    return this.dirtyFlags;
  }

  /** Marks positions dirty and bumps geometry generation. */
  markPositionsDirty(): void {
    this.dirtyFlags.markPositionsDirty();
    this.bumpGeometryGeneration();
  }

  /** Marks topology dirty and bumps geometry generation. */
  markTopologyDirty(): void {
    this.dirtyFlags.markTopologyDirty();
    this.attributes.ensureTopologySizes(this.topology.getHalfEdgeCount(), this.topology.getFaceCount());
    this.topologyGeneration += 1;
    this.bumpGeometryGeneration();
  }

  /** Marks attributes dirty and bumps geometry generation. */
  markAttributesDirty(): void {
    this.dirtyFlags.markAttributesDirty();
    this.bumpGeometryGeneration();
  }

  /** Clears dirty flags after presentation has consumed them. */
  clearDirtyFlagsAfterPresentation(): void {
    this.dirtyFlags.clearAll();
  }

  /**
   * Replaces topology and marks topology dirty.
   *
   * @param topology New topology.
   */
  setTopology(topology: MeshTopology): void {
    this.topology = topology;
    this.markTopologyDirty();
  }

  /**
   * Deep-clones topology, attributes, dirty flags, and generation.
   *
   * @returns Independent document.
   */
  clone(): MeshDocument {
    const copy = new MeshDocument(this.topology.clone(), this.attributes.clone());
    copy.geometryGeneration = this.geometryGeneration;
    copy.topologyGeneration = this.topologyGeneration;
    copy.dirtyFlags = this.dirtyFlags.clone();
    return copy;
  }

  /** Increments the geometry generation counter. */
  private bumpGeometryGeneration(): void {
    this.geometryGeneration += 1;
  }
}
