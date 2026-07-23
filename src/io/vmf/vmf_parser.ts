import {
  VmfEntity,
  VmfSolid,
  VmfSolidSide,
  VmfTextureAxis,
  VmfVector3,
  VmfWorld,
  createDefaultVmfTextureAxis,
  createEmptyVmfWorld
} from './vmf_types.js';

/**
 * Mutable pointers while walking a VMF document tree.
 */
interface VmfParseCursor {
  solid: VmfSolid | null;
  solidSide: VmfSolidSide | null;
  entity: VmfEntity | null;
}

/**
 * Parses Valve Map Format 2006 text into a structured world document.
 * Handles world solids, entity solids, and keyvalue type detection.
 */
export class VmfParser {
  /**
   * Parses a full VMF document string.
   * @param source Complete VMF file contents.
   * @returns Parsed world with solids and entities.
   */
  parse(source: string): VmfWorld {
    const world = createEmptyVmfWorld();
    const closures: Array<string | null> = new Array(64).fill(null);
    const cursor: VmfParseCursor = {
      solid: null,
      solidSide: null,
      entity: null
    };
    this.walkDocumentLines(source, world, closures, cursor);
    return world;
  }

  /**
   * Walks each non-empty line of the VMF document.
   * @param source Full document text.
   * @param world Target world.
   * @param closures Active block names by depth.
   * @param cursor Mutable solid/entity pointers.
   */
  private walkDocumentLines(
    source: string,
    world: VmfWorld,
    closures: Array<string | null>,
    cursor: VmfParseCursor
  ): void {
    let depth = 0;
    let previousLine = '';
    let justEnteredClosure = false;
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      const depthChange = this.applyBraceLine(line, closures, depth, previousLine);
      if (depthChange.handled) {
        depth = depthChange.depth;
        justEnteredClosure = depthChange.justEntered;
        continue;
      }
      this.dispatchLine(line, closures, world, justEnteredClosure, cursor);
      previousLine = line;
      justEnteredClosure = false;
    }
  }

  /**
   * Handles opening/closing braces and updates closure stack depth.
   * @param line Trimmed line.
   * @param closures Closure name stack.
   * @param depth Current depth.
   * @param previousLine Previous non-brace line (block name).
   * @returns Whether the line was a brace and the new depth state.
   */
  private applyBraceLine(
    line: string,
    closures: Array<string | null>,
    depth: number,
    previousLine: string
  ): { handled: boolean; depth: number; justEntered: boolean } {
    if (line[0] === '{') {
      closures[depth] = previousLine;
      return { handled: true, depth: depth + 1, justEntered: true };
    }
    if (line[0] === '}') {
      const nextDepth = depth - 1;
      closures[nextDepth] = null;
      return { handled: true, depth: nextDepth, justEntered: false };
    }
    return { handled: false, depth, justEntered: false };
  }

  /**
   * Routes one content line into the correct parse handler.
   * @param line Trimmed content line.
   * @param closures Active block names by depth.
   * @param world World being filled.
   * @param justEnteredClosure Whether a new block started on the previous line.
   * @param state Mutable solid/entity pointers.
   */
  private dispatchLine(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    this.parseVersionInfo(line, closures, world);
    this.parseViewSettings(line, closures, world);
    this.parseWorldProperties(line, closures, world);
    this.parseWorldSolid(line, closures, world, justEnteredClosure, state);
    this.parseWorldSolidSide(line, closures, justEnteredClosure, state);
    this.parseEntity(line, closures, world, justEnteredClosure, state);
    this.parseEntitySolid(line, closures, justEnteredClosure, state);
    this.parseEntitySolidSide(line, closures, justEnteredClosure, state);
  }

  /**
   * Parses versioninfo keyvalues.
   * @param line Content line.
   * @param closures Active closures.
   * @param world Target world.
   */
  private parseVersionInfo(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld
  ): void {
    if (closures[0] !== 'versioninfo') return;
    const pair = this.tryParseKeyValue(line);
    if (!pair) return;
    if (pair.key === 'editorversion') world.versionInfoEditorVersion = Number(pair.value);
    if (pair.key === 'editorbuild') world.versionInfoEditorBuild = Number(pair.value);
    if (pair.key === 'mapversion') world.versionInfoMapVersion = Number(pair.value);
    if (pair.key === 'formatversion') world.versionInfoFormatVersion = Number(pair.value);
    if (pair.key === 'prefab') world.versionInfoPrefab = Number(pair.value);
  }

  /**
   * Parses viewsettings keyvalues.
   * @param line Content line.
   * @param closures Active closures.
   * @param world Target world.
   */
  private parseViewSettings(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld
  ): void {
    if (closures[0] !== 'viewsettings') return;
    const pair = this.tryParseKeyValue(line);
    if (!pair) return;
    if (pair.key === 'bSnapToGrid') world.viewSettingsSnapToGrid = Number(pair.value);
    if (pair.key === 'bShowGrid') world.viewSettingsShowGrid = Number(pair.value);
    if (pair.key === 'bShowLogicalGrid') {
      world.viewSettingsShowLogicalGrid = Number(pair.value);
    }
    if (pair.key === 'nGridSpacing') world.viewSettingsGridSpacing = Number(pair.value);
    if (pair.key === 'bShow3DGrid') world.viewSettingsShow3DGrid = Number(pair.value);
  }

  /**
   * Parses top-level worldspawn properties.
   * @param line Content line.
   * @param closures Active closures.
   * @param world Target world.
   */
  private parseWorldProperties(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld
  ): void {
    if (closures[0] !== 'world' || closures[1] !== null) return;
    const pair = this.tryParseKeyValue(line);
    if (!pair) return;
    if (pair.key === 'id') world.id = Number(pair.value);
    if (pair.key === 'mapversion') world.mapVersion = Number(pair.value);
    if (pair.key === 'classname') world.className = String(pair.value);
    if (pair.key === 'detailmaterial') world.detailMaterial = String(pair.value);
    if (pair.key === 'detailvbsp') world.detailVBsp = String(pair.value);
    if (pair.key === 'maxpropscreenwidth') {
      world.maxPropScreenWidth = Number(pair.value);
    }
    if (pair.key === 'skyname') world.skyName = String(pair.value);
  }

  /**
   * Parses world-level solid blocks.
   * @param line Content line.
   * @param closures Active closures.
   * @param world Target world.
   * @param justEnteredClosure Whether this is the first line inside a new block.
   * @param state Mutable parse pointers.
   */
  private parseWorldSolid(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (closures[0] !== 'world' || closures[1] !== 'solid' || closures[2] !== null) {
      return;
    }
    if (justEnteredClosure) {
      state.solid = { id: -1, sides: [] };
      world.solids.push(state.solid);
    }
    const pair = this.tryParseKeyValue(line);
    if (pair && pair.key === 'id' && state.solid) {
      state.solid.id = Number(pair.value);
    }
  }

  /**
   * Parses sides under a world solid.
   * @param line Content line.
   * @param closures Active closures.
   * @param justEnteredClosure Whether this is the first line inside a new block.
   * @param state Mutable parse pointers.
   */
  private parseWorldSolidSide(
    line: string,
    closures: Array<string | null>,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (
      closures[0] !== 'world' ||
      closures[1] !== 'solid' ||
      closures[2] !== 'side' ||
      closures[3] !== null
    ) {
      return;
    }
    this.ensureSideOnSolid(justEnteredClosure, state);
    this.applySideKeyValue(line, state.solidSide);
  }

  /**
   * Parses entity blocks and their keyvalues.
   * @param line Content line.
   * @param closures Active closures.
   * @param world Target world.
   * @param justEnteredClosure Whether this is the first line inside a new block.
   * @param state Mutable parse pointers.
   */
  private parseEntity(
    line: string,
    closures: Array<string | null>,
    world: VmfWorld,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (closures[0] !== 'entity' || closures[1] !== null) return;
    if (justEnteredClosure) {
      state.entity = {
        id: -1,
        className: '',
        solids: [],
        properties: {}
      };
      world.entities.push(state.entity);
    }
    const pair = this.tryParseKeyValue(line);
    if (!pair || !state.entity) return;
    if (pair.key === 'id') {
      state.entity.id = Number(pair.value);
      return;
    }
    if (pair.key === 'classname') {
      state.entity.className = String(pair.value);
      return;
    }
    state.entity.properties[pair.key] = pair.value as string | number | VmfVector3;
  }

  /**
   * Parses solids nested under entities.
   * @param line Content line.
   * @param closures Active closures.
   * @param justEnteredClosure Whether this is the first line inside a new block.
   * @param state Mutable parse pointers.
   */
  private parseEntitySolid(
    line: string,
    closures: Array<string | null>,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (closures[0] !== 'entity' || closures[1] !== 'solid' || closures[2] !== null) {
      return;
    }
    if (justEnteredClosure && state.entity) {
      state.solid = { id: -1, sides: [] };
      state.entity.solids.push(state.solid);
    }
    const pair = this.tryParseKeyValue(line);
    if (pair && pair.key === 'id' && state.solid) {
      state.solid.id = Number(pair.value);
    }
  }

  /**
   * Parses sides under an entity solid.
   * @param line Content line.
   * @param closures Active closures.
   * @param justEnteredClosure Whether this is the first line inside a new block.
   * @param state Mutable parse pointers.
   */
  private parseEntitySolidSide(
    line: string,
    closures: Array<string | null>,
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (
      closures[0] !== 'entity' ||
      closures[1] !== 'solid' ||
      closures[2] !== 'side' ||
      closures[3] !== null
    ) {
      return;
    }
    this.ensureSideOnSolid(justEnteredClosure, state);
    this.applySideKeyValue(line, state.solidSide);
  }

  /**
   * Ensures a new side object exists when entering a side block.
   * @param justEnteredClosure Whether the side block just opened.
   * @param state Mutable parse pointers.
   */
  private ensureSideOnSolid(
    justEnteredClosure: boolean,
    state: VmfParseCursor
  ): void {
    if (!justEnteredClosure || !state.solid) return;
    state.solidSide = this.createEmptySide();
    state.solid.sides.push(state.solidSide);
  }

  /**
   * Applies a keyvalue onto a solid side when recognized.
   * @param line Content line.
   * @param solidSide Target side or null.
   */
  private applySideKeyValue(line: string, solidSide: VmfSolidSide | null): void {
    if (!solidSide) return;
    const pair = this.tryParseKeyValue(line);
    if (!pair) return;
    this.writeSideProperty(solidSide, pair.key, pair.value);
  }

  /**
   * Writes one recognized side property onto a solid side.
   * @param solidSide Target side.
   * @param key Property name.
   * @param value Parsed value.
   */
  private writeSideProperty(
    solidSide: VmfSolidSide,
    key: string,
    value: string | number | VmfVector3 | object
  ): void {
    if (key === 'id') solidSide.id = Number(value);
    if (key === 'plane' && this.isPlanePoints(value)) solidSide.plane = value;
    if (key === 'material') solidSide.material = String(value);
    if (key === 'rotation') solidSide.rotation = Number(value);
    if (key === 'uaxis' && this.isTextureAxis(value)) solidSide.uAxis = value;
    if (key === 'vaxis' && this.isTextureAxis(value)) solidSide.vAxis = value;
    if (key === 'lightmapscale') solidSide.lightmapScale = Number(value);
    if (key === 'smoothing_groups') solidSide.smoothingGroups = Number(value);
  }

  /**
   * Creates an empty solid side with default UV axes.
   * @returns New side object.
   */
  private createEmptySide(): VmfSolidSide {
    return {
      id: -1,
      plane: {
        p1: { x: 0, y: 0, z: 0 },
        p2: { x: 0, y: 0, z: 0 },
        p3: { x: 0, y: 0, z: 0 }
      },
      material: '',
      rotation: 0,
      uAxis: createDefaultVmfTextureAxis(),
      vAxis: createDefaultVmfTextureAxis(),
      lightmapScale: 16,
      smoothingGroups: 0,
      displacement: null
    };
  }

  /**
   * Parses a quoted keyvalue line into a typed value.
   * @param line Line such as `"plane" "(0 0 0) (1 0 0) (1 1 0)"`.
   * @returns Key and value, or null when not a keyvalue line.
   */
  tryParseKeyValue(
    line: string
  ): { key: string; value: string | number | VmfVector3 | object } | null {
    if (!line.includes('"')) return null;
    if ((line.match(/"/g) ?? []).length !== 4) return null;
    const firstEnd = line.indexOf('"', 1);
    if (firstEnd < 0) return null;
    const key = line.substring(1, firstEnd);
    const rawOriginal = line.substring(firstEnd + 3, line.length - 1);
    if (rawOriginal.length === 0) return null;
    let raw = rawOriginal.replace(/--/g, '-');
    raw = raw.replace(/\s+/g, ' ');
    return { key, value: this.parseValue(raw, rawOriginal) };
  }

  /**
   * Detects plane, axis, vector, float, int, or string values.
   * @param raw Normalized raw value text.
   * @param rawOriginal Original raw value (preserves string content).
   * @returns Typed value.
   */
  private parseValue(
    raw: string,
    rawOriginal: string
  ): string | number | VmfVector3 | object {
    if (raw[0] === '(') return this.parsePlanePoints(raw);
    if (raw[0] === '[' && raw[raw.length - 1] !== ']') {
      return this.parseTextureAxis(raw);
    }
    const vector = this.tryParseVector3(raw);
    if (vector) return vector;
    if (raw.includes('.') && !Number.isNaN(Number(raw))) return Number(raw);
    const asInt = Number.parseInt(raw, 10);
    if (!Number.isNaN(asInt) && String(asInt) === raw) return asInt;
    return rawOriginal;
  }

  /**
   * Parses three parenthesized points into a plane definition.
   * @param raw Value beginning with '('.
   * @returns Plane point triple.
   */
  private parsePlanePoints(raw: string): {
    p1: VmfVector3;
    p2: VmfVector3;
    p3: VmfVector3;
  } {
    const numbers = raw
      .replace(/[()]/g, '')
      .trim()
      .split(' ')
      .map((token) => Number.parseFloat(token));
    return {
      p1: { x: numbers[0], y: numbers[1], z: numbers[2] },
      p2: { x: numbers[3], y: numbers[4], z: numbers[5] },
      p3: { x: numbers[6], y: numbers[7], z: numbers[8] }
    };
  }

  /**
   * Parses a Hammer UV axis `[x y z offset] scale`.
   * @param raw Axis string without trailing `]` only form.
   * @returns Texture axis components.
   */
  private parseTextureAxis(raw: string): VmfTextureAxis {
    const numbers = raw
      .replace(/[\[\]]/g, '')
      .trim()
      .split(' ')
      .map((token) => Number.parseFloat(token));
    return {
      x: numbers[0],
      y: numbers[1],
      z: numbers[2],
      translation: numbers[3],
      scale: numbers[4]
    };
  }

  /**
   * Attempts to parse a space-separated three-float vector.
   * @param raw Candidate text.
   * @returns Vector or null.
   */
  private tryParseVector3(raw: string): VmfVector3 | null {
    const cleaned = raw.replace(/[\[\]]/g, '');
    const parts = cleaned.split(' ');
    if (parts.length !== 3) return null;
    if (!parts.every((part) => /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(part))) {
      return null;
    }
    return {
      x: Number.parseFloat(parts[0]),
      y: Number.parseFloat(parts[1]),
      z: Number.parseFloat(parts[2])
    };
  }

  /**
   * Type guard for plane point triples.
   * @param value Candidate value.
   * @returns True when value has p1/p2/p3.
   */
  private isPlanePoints(
    value: unknown
  ): value is { p1: VmfVector3; p2: VmfVector3; p3: VmfVector3 } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'p1' in value &&
      'p2' in value &&
      'p3' in value
    );
  }

  /**
   * Type guard for texture axes.
   * @param value Candidate value.
   * @returns True when value looks like a texture axis.
   */
  private isTextureAxis(value: unknown): value is VmfTextureAxis {
    return (
      typeof value === 'object' &&
      value !== null &&
      'translation' in value &&
      'scale' in value
    );
  }
}
