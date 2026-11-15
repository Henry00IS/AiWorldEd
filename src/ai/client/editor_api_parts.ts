import type { EditorApiHost } from './editor_api_host.js';
import { EditorApiAlign } from './editor_api_align.js';
import { EditorApiBuilders } from './editor_api_builders.js';
import { EditorApiCapture } from './editor_api_capture.js';
import { EditorApiCsgQuery } from './editor_api_csg_query.js';
import { EditorApiFind } from './editor_api_find.js';
import { EditorApiGeometry } from './editor_api_geometry.js';
import { EditorApiHierarchy } from './editor_api_hierarchy.js';
import { EditorApiSolidReads } from './editor_api_solid_reads.js';
import { EditorApiSolidWrites } from './editor_api_solid_writes.js';
import { EditorApiSpatial } from './editor_api_spatial.js';
import { EditorApiValidation } from './editor_api_validation.js';

/** Implementation parts the MCP tool groups call into, bound to one editor. */
export class EditorApiParts {
  readonly host: EditorApiHost;
  readonly reads: EditorApiSolidReads;
  readonly writes: EditorApiSolidWrites;
  readonly spatial: EditorApiSpatial;
  readonly validation: EditorApiValidation;
  readonly find: EditorApiFind;
  readonly align: EditorApiAlign;
  readonly builders: EditorApiBuilders;
  readonly csgQuery: EditorApiCsgQuery;
  readonly hierarchy: EditorApiHierarchy;
  readonly capture: EditorApiCapture;
  readonly geometry: EditorApiGeometry;

  /**
   * Creates every part for one editor.
   *
   * @param host Injected host dependencies.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
    this.reads = new EditorApiSolidReads(host);
    this.writes = new EditorApiSolidWrites(host);
    this.spatial = new EditorApiSpatial(host);
    this.validation = new EditorApiValidation(host);
    this.find = new EditorApiFind(host);
    this.align = new EditorApiAlign(host);
    this.builders = new EditorApiBuilders(host, this.writes);
    this.csgQuery = new EditorApiCsgQuery(host);
    this.hierarchy = new EditorApiHierarchy(host);
    this.capture = new EditorApiCapture(host);
    this.geometry = new EditorApiGeometry(host);
  }
}
