import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmCompactHierarchyBuilder } from './solid_algorithm_compact_hierarchy_builder.js';
import type { SolidAlgorithmCompactNode } from './solid_algorithm_compact_node.js';
import { SolidAlgorithmCreateRoutingTableJob } from './solid_algorithm_create_routing_table_job.js';
import { SolidAlgorithmRoutingTable } from './solid_algorithm_routing_table.js';
import { SolidAlgorithmBrushIntersection } from './solid_algorithm_brush_intersection.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Caches per-subject routing tables and one compact hierarchy per
 * tree/inverted-world fingerprint so a full map rebuild does not rebuild the
 * hierarchy once per brush.
 */
export class SolidAlgorithmRoutingTableCache {
  private readonly tablesBySubjectId = new Map<string, SolidAlgorithmRoutingTable>();
  private readonly keyBySubjectId = new Map<string, string>();
  private hierarchyCacheKey = '';
  private hierarchyCache: readonly SolidAlgorithmCompactNode[] = [];
  private readonly structureKeyByTree = new WeakMap<SolidCsgTree, string>();

  /** Clears all cached tables and the compact hierarchy. */
  clear(): void {
    this.tablesBySubjectId.clear();
    this.keyBySubjectId.clear();
    this.hierarchyCacheKey = '';
    this.hierarchyCache = [];
  }

  /**
   * Returns a routing table for the subject, building and caching when needed.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param tree CSG tree.
   * @param invertedWorld Whether CSG starts solid.
   * @param _unusedLegacyFullWalk Ignored; tables are always peer-local.
   * @returns Routing table for the subject.
   */
  getOrBuild(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    tree: SolidCsgTree,
    invertedWorld: boolean,
    _unusedLegacyFullWalk: boolean = false,
  ): SolidAlgorithmRoutingTable {
    void _unusedLegacyFullWalk;
    const subject = prepared[subjectIndex];
    if (!subject) {
      return SolidAlgorithmRoutingTable.empty(invertedWorld);
    }
    const cacheKey = this.buildCacheKey(prepared, subjectIndex, invertedWorld, tree);
    const existingKey = this.keyBySubjectId.get(subject.instance.id);
    const existing = this.tablesBySubjectId.get(subject.instance.id);
    if (existing && existingKey === cacheKey) {
      return existing;
    }
    const hierarchy = this.getOrBuildHierarchy(tree, invertedWorld);
    const table = SolidAlgorithmCreateRoutingTableJob.buildForSubject(
      prepared,
      subjectIndex,
      hierarchy,
      invertedWorld,
      SOLID_BOUNDS_EPSILON,
      SOLID_FAT_PLANE_EPSILON,
    );
    this.tablesBySubjectId.set(subject.instance.id, table);
    this.keyBySubjectId.set(subject.instance.id, cacheKey);
    return table;
  }

  /**
   * Drops all cached tables (prepared indices and hierarchy may shift).
   *
   * @param _brushId Brush instance id (unused; full clear is required).
   */
  invalidateBrush(_brushId: string): void {
    void _brushId;
    this.clear();
  }

  /**
   * Returns a cached compact hierarchy for the tree, building when the
   * fingerprint changes.
   *
   * @param tree CSG tree.
   * @param invertedWorld Inverted-world flag.
   * @returns Compact hierarchy nodes.
   */
  private getOrBuildHierarchy(tree: SolidCsgTree, invertedWorld: boolean): readonly SolidAlgorithmCompactNode[] {
    const key = `${invertedWorld ? '1' : '0'}|${this.treeKey(tree)}`;
    if (this.hierarchyCacheKey === key && this.hierarchyCache.length > 0) {
      return this.hierarchyCache;
    }
    this.hierarchyCache = SolidAlgorithmCompactHierarchyBuilder.build(tree, invertedWorld);
    this.hierarchyCacheKey = key;
    return this.hierarchyCache;
  }

  /**
   * Builds a cache key from the subject placement, peer operations, and the
   * touch type of every overlapping peer.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param invertedWorld Inverted-world flag.
   * @param tree CSG tree.
   * @returns Cache key string.
   */
  private buildCacheKey(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    invertedWorld: boolean,
    tree: SolidCsgTree,
  ): string {
    const subject = prepared[subjectIndex];
    if (!subject) {
      return 'missing';
    }
    const parts: string[] = [
      subject.instance.id,
      invertedWorld ? '1' : '0',
      `si:${subjectIndex}`,
      `so:${subject.operation}`,
    ];
    if (!tree.isFlat) {
      parts.push(`th:${this.treeKey(tree)}`);
    }
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex];
      if (!peer) {
        continue;
      }
      const touchType = SolidAlgorithmBrushIntersection.classify(
        subject,
        peerIndex,
        prepared,
        SOLID_BOUNDS_EPSILON,
        SOLID_FAT_PLANE_EPSILON,
      );
      parts.push(`p:${peerIndex}:${peer.instance.id}:${peer.operation}:${touchType}`);
    }
    return parts.join('|');
  }


  /**
   * Returns the structure key of a tree, computed once per tree (trees are
   * rebuilt for every compile and not changed afterwards).
   *
   * @param tree CSG tree.
   * @returns Structure key.
   */
  private treeKey(tree: SolidCsgTree): string {
    const known = this.structureKeyByTree.get(tree);
    if (known !== undefined) return known;
    const key = this.treeStructureKey(tree.roots);
    this.structureKeyByTree.set(tree, key);
    return key;
  }

  /**
   * Serializes tree structure and branch operations into a cache key fragment.
   *
   * @param nodes Tree nodes.
   * @returns Structure key.
   */
  private treeStructureKey(
    nodes: readonly import('@/solid/algorithm/compile/solid_csg_tree.js').SolidCsgTreeNode[],
  ): string {
    return nodes
      .map((node) => {
        if (node.kind === 'brush') {
          return `L${node.preparedIndex}:${node.operation}`;
        }
        return `B${node.operation}(${this.treeStructureKey(node.children)})`;
      })
      .join(',');
  }
}
