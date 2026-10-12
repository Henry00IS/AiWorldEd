import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { TransformMode } from '@/types/transform_mode.js';
import type { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import type { Tool } from '@/editor/tools/tool.js';
import { CoordinatorEditMode } from '@/edit/coordinator/coordinator_edit_mode.js';
import { EditLoopCutTool } from '@/edit/tool/edit_loop_cut_tool.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import type { EditEdgeParameterHit } from '@/edit/pick/edit_edge_parameter_pick.js';
import type { LoopCutBeltParameterRange } from '@/edit/topology/topology_loop_cut_belt_range.js';
import { previewTopologyLoopCut } from '@/edit/topology/topology_loop_cut.js';
import type { TopologyWorkingEdge } from '@/edit/topology/topology_working_edge_key.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { findWorkingEdgeParallelToX } from '../topology/topology_test_edges.js';

describe('edit_loop_cut_tool', () => {
  it('is busy while single-use until cancelled', () => {
    const tool = new EditLoopCutTool();
    tool.parent = new EditSelectTool();
    expect(tool.isBusy()).toBe(true);
    tool.onKeyDown('Escape');
    expect(tool.isBusy()).toBe(false);
    tool.onDeactivate();
    expect(tool.isBusy()).toBe(false);
  });

  it('returns to the parent tool after the confirming click and selects the loop', () => {
    const harness = createLoopCutHarness();
    const expectedCount = harness.previewCrossingCount;
    expect(expectedCount).toBeGreaterThan(2);
    harness.tool.onActivate();
    harness.tool.onRender();
    harness.tool.onMouseDown(0);
    expect(harness.editor.activeTool).toBe(harness.tool);
    expect(harness.coordinator.getComponentSelectionCount()).toBe(0);
    harness.tool.onMouseDown(0);
    expect(harness.editor.activeTool).toBe(harness.parent);
    expect(harness.tool.isBusy()).toBe(false);
    expect(harness.coordinator.getComponentSelectionCount()).toBe(expectedCount);
    expect(selectionKinds(harness.coordinator)).toEqual(Array.from({ length: expectedCount }, () => 'vertex'));
    expect(selectedVerticesShareCutX(harness.coordinator, harness.cutCoordinate)).toBe(true);
    harness.coordinator.setComponentMode(EditorComponentMode.EDGE);
    expect(harness.coordinator.getComponentSelectionCount()).toBe(expectedCount);
    expect(selectionKinds(harness.coordinator)).toEqual(Array.from({ length: expectedCount }, () => 'edge'));
    expect(selectedEdgesShareCutX(harness.coordinator, harness.cutCoordinate)).toBe(true);
    harness.tool.onMouseDown(0);
    expect(harness.editor.activeTool).toBe(harness.parent);
    harness.coordinator.exitToObjectMode();
  });

  it('slides from the mouse-move position when the stored pointer is the shift-press point', () => {
    const harness = createLoopCutHarness();
    const samples = collectSlidePointerSamples(harness);
    harness.tool.onActivate();
    harness.tool.onRender();
    harness.tool.onMouseDown(0);
    samples.points.length = 0;
    harness.editor.mousePosition.set(180, 90);
    harness.editor.lastPointerClientX = 12;
    harness.editor.lastPointerClientY = 34;
    harness.tool.onRender();
    expect(samples.points).toEqual([{ clientX: 180, clientY: 90 }]);
    harness.coordinator.exitToObjectMode();
  });
});

/** Editor stub plus the live edit session used by one loop-cut pass. */
interface LoopCutHarness {
  /** Loop-cut tool under test. */
  tool: EditLoopCutTool;
  /** Tool that launched the loop cut. */
  parent: EditSelectTool;
  /** Editor double that records the active tool. */
  editor: EditorWindow & { activeTool: Tool };
  /** Edit session host. */
  coordinator: CoordinatorEditMode;
  /** Crossing count of the preview that the click should commit. */
  previewCrossingCount: number;
  /** Local X of the committed cut. */
  cutCoordinate: number;
}

/** Edge, preview, and cut coordinate a loop-cut harness is aimed at. */
interface AimedLoopCut {
  /** Stationary edge hit. */
  hit: EditEdgeParameterHit;
  /** Crossing count of the preview that the click should commit. */
  previewCrossingCount: number;
  /** Local X of the committed cut. */
  cutCoordinate: number;
}

/**
 * Builds a box brush in Edit Mode and a loop-cut tool aimed at an edge parallel
 * to X.
 *
 * @returns Harness.
 */
function createLoopCutHarness(): LoopCutHarness {
  const scene = new THREE.Scene();
  const coordinator = createCoordinator(scene, addHarnessBoxMesh(scene));
  expect(coordinator.enterFromObjectSelection()).toBe(true);
  return assembleLoopCutHarness(scene, coordinator, aimLoopCutAtParallelEdge(coordinator));
}

/**
 * Adds a centered box brush and returns its preview mesh.
 *
 * @param scene Scene that owns the solid.
 * @returns Brush mesh.
 */
function addHarnessBoxMesh(scene: THREE.Scene): THREE.Mesh {
  const solidModel = new SolidModel('LoopCutTool');
  scene.add(solidModel.root);
  const instance = solidModel.addBoxBrush(2, SolidOperation.Additive);
  solidModel.rebuild(true);
  const mesh = instance.mesh;
  if (!mesh) {
    throw new Error('box brush has no mesh');
  }
  return mesh;
}

/**
 * Aims a loop cut at the box edge parallel to X.
 *
 * @param coordinator Edit coordinator.
 * @returns Hit, preview size, and cut coordinate.
 */
function aimLoopCutAtParallelEdge(coordinator: CoordinatorEditMode): AimedLoopCut {
  const working = readCoordinatorWorking(coordinator);
  const edge = findWorkingEdgeParallelToX(working);
  if (!edge) {
    throw new Error('box has no edge parallel to X');
  }
  return buildAimedLoopCut(readOnlyTargetId(coordinator), working, edge);
}

/**
 * Reads working geometry for the open brush.
 *
 * @param coordinator Edit coordinator.
 * @returns Working geometry.
 */
function readCoordinatorWorking(coordinator: CoordinatorEditMode): TopologyWorkingGeometry {
  const target = coordinator.getSession().getDomain()[0];
  if (!target || target.kind !== 'brush') {
    throw new Error('edit domain is not a brush');
  }
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance) {
    throw new Error('brush instance is missing');
  }
  return brushToWorkingGeometry(instance.brush);
}

/**
 * Builds the hit and cut coordinate for one seed edge.
 *
 * @param targetId Domain target id.
 * @param working Working geometry.
 * @param edge Seed edge.
 * @returns Aimed loop cut.
 */
function buildAimedLoopCut(
  targetId: string,
  working: TopologyWorkingGeometry,
  edge: { vertexA: number; vertexB: number },
): AimedLoopCut {
  const parameter = 0.4;
  const preview = previewTopologyLoopCut(working, edge.vertexA, edge.vertexB, parameter);
  if (!preview) {
    throw new Error('edge parallel to X has no loop');
  }
  return {
    hit: createEdgeHit(targetId, edge, working, parameter),
    previewCrossingCount: preview.crossings.length,
    cutCoordinate: readEdgeCutCoordinate(working, edge, parameter),
  };
}

/**
 * Wires the loop-cut tool to a prepared editor and coordinator.
 *
 * @param scene Overlay scene.
 * @param coordinator Edit coordinator.
 * @param aimed Edge the pointer stays on.
 * @returns Harness.
 */
function assembleLoopCutHarness(
  scene: THREE.Scene,
  coordinator: CoordinatorEditMode,
  aimed: AimedLoopCut,
): LoopCutHarness {
  const parent = new EditSelectTool();
  const tool = new EditLoopCutTool();
  tool.parent = parent;
  const editor = createEditorDouble(tool, coordinator, scene, aimed.hit);
  tool.editor = editor;
  parent.editor = editor;
  return createHarnessRecord(tool, parent, editor, coordinator, aimed);
}

/**
 * Packs a harness record.
 *
 * @param tool Loop-cut tool.
 * @param parent Parent tool.
 * @param editor Editor double.
 * @param coordinator Edit coordinator.
 * @param aimed Aimed cut.
 * @returns Harness.
 */
function createHarnessRecord(
  tool: EditLoopCutTool,
  parent: EditSelectTool,
  editor: EditorWindow & { activeTool: Tool },
  coordinator: CoordinatorEditMode,
  aimed: AimedLoopCut,
): LoopCutHarness {
  return {
    tool,
    parent,
    editor,
    coordinator,
    previewCrossingCount: aimed.previewCrossingCount,
    cutCoordinate: aimed.cutCoordinate,
  };
}

/**
 * Creates an Edit Mode coordinator for one brush mesh.
 *
 * @param scene Overlay scene.
 * @param mesh Brush mesh.
 * @returns Coordinator.
 */
function createCoordinator(scene: THREE.Scene, mesh: THREE.Mesh): CoordinatorEditMode {
  return new CoordinatorEditMode({
    getPrimaryScene: () => scene,
    getSelectedObjects: () => [mesh],
    getViewports: () => [],
    showStatusMessage: () => undefined,
    getCommandStack: () => null,
  });
}

/**
 * Reads the only domain target id.
 *
 * @param coordinator Edit coordinator.
 * @returns Target id.
 */
function readOnlyTargetId(coordinator: CoordinatorEditMode): string {
  const target = coordinator.getSession().getDomain()[0];
  if (!target) {
    throw new Error('edit domain is empty');
  }
  return target.targetId;
}

/**
 * Builds an edge hit from working-geometry endpoints.
 *
 * @param targetId Domain target id.
 * @param edge Seed edge.
 * @param working Working geometry.
 * @param parameter Cut parameter.
 * @returns Hit.
 */
function createEdgeHit(
  targetId: string,
  edge: { vertexA: number; vertexB: number },
  working: ReturnType<typeof brushToWorkingGeometry>,
  parameter: number,
): EditEdgeParameterHit {
  const worldA = working.positions[edge.vertexA]?.clone();
  const worldB = working.positions[edge.vertexB]?.clone();
  if (!worldA || !worldB) {
    throw new Error('edge endpoints are missing');
  }
  return {
    targetId,
    vertexA: edge.vertexA,
    vertexB: edge.vertexB,
    parameter,
    worldPoint: worldA.clone().lerp(worldB, parameter),
    edgeDirection: worldB.clone().sub(worldA),
    worldA,
    worldB,
  };
}

/**
 * Builds an editor double whose tool switch matches the real deactivate order.
 *
 * @param tool Loop-cut tool.
 * @param coordinator Edit coordinator.
 * @param scene Overlay scene.
 * @param hit Edge the pointer stays on.
 * @returns Editor double.
 */
function createEditorDouble(
  tool: EditLoopCutTool,
  coordinator: CoordinatorEditMode,
  scene: THREE.Scene,
  hit: EditEdgeParameterHit,
): EditorWindow & { activeTool: Tool } {
  const editor = {
    activeTool: tool as Tool,
    mousePosition: new THREE.Vector2(),
    lastPointerClientX: 0,
    lastPointerClientY: 0,
    lastPointerOwnerDocument: null,
    isShiftPressed: false,
    switchTool(next: Tool) {
      editor.activeTool.onDeactivate();
      editor.activeTool = next;
      next.editor = editor as unknown as EditorWindow;
      next.onActivate();
    },
    getServices: () => createHarnessServices(coordinator, scene, hit),
  };
  return editor as unknown as EditorWindow & { activeTool: Tool };
}

/**
 * Builds the services the loop-cut tool calls during one pass.
 *
 * @param coordinator Edit coordinator.
 * @param scene Overlay scene.
 * @param hit Stationary edge hit.
 * @returns Services.
 */
function createHarnessServices(
  coordinator: CoordinatorEditMode,
  scene: THREE.Scene,
  hit: EditEdgeParameterHit,
): EditorServices {
  return {
    pickEditEdgeParameter: () => hit,
    getEditSession: () => coordinator.getSession(),
    loopCutEditEdge: (
      targetId: string,
      vertexA: number,
      vertexB: number,
      parameter: number,
      lockedEdges?: readonly TopologyWorkingEdge[],
    ) => coordinator.loopCut(targetId, vertexA, vertexB, parameter, lockedEdges),
    projectLockedLoopCutParameter: () => hit.parameter,
    snapEditLoopCutParameter: (
      _worldA: THREE.Vector3,
      _worldB: THREE.Vector3,
      parameter: number,
      _shiftHeld: boolean,
      _range: LoopCutBeltParameterRange | null,
    ) => parameter,
    getPrimaryScene: () => scene,
    setStatusMessage: () => undefined,
    getWidgetMode: () => TransformMode.BOUNDS,
    refreshGizmoPresentation: () => undefined,
  } as unknown as EditorServices;
}

/** Pointer samples observed while a locked belt slides. */
interface SlidePointerSamples {
  /** Client points passed to the locked projector. */
  points: { clientX: number; clientY: number }[];
}

/**
 * Records client coordinates passed to the locked slide projector.
 *
 * @param harness Loop-cut harness.
 * @returns Mutable sample list.
 */
function collectSlidePointerSamples(harness: LoopCutHarness): SlidePointerSamples {
  const points: { clientX: number; clientY: number }[] = [];
  const readServices = harness.editor.getServices.bind(harness.editor);
  harness.editor.getServices = () => recordSlidePointer(readLoopCutServices(readServices()), points);
  return { points };
}

/**
 * Returns services for a loop-cut sample.
 *
 * @param services Services from the editor, or null.
 * @returns Services.
 */
function readLoopCutServices(services: EditorServices | null): EditorServices {
  if (!services) {
    throw new Error('loop cut services are missing');
  }
  return services;
}

/**
 * Wraps the locked projector so each sample is recorded.
 *
 * @param services Services for one call.
 * @param points Sample list to append to.
 * @returns The same services object.
 */
function recordSlidePointer(services: EditorServices, points: { clientX: number; clientY: number }[]): EditorServices {
  const project = services.projectLockedLoopCutParameter;
  services.projectLockedLoopCutParameter = (clientX, clientY, worldA, worldB, ownerDocument) => {
    points.push({ clientX, clientY });
    if (!project) {
      return null;
    }
    return project(clientX, clientY, worldA, worldB, ownerDocument);
  };
  return services;
}

/**
 * Reads the local X of a cut along an edge parallel to X.
 *
 * @param working Working geometry before the cut.
 * @param edge Seed edge.
 * @param parameter Slide parameter.
 * @returns Cut coordinate.
 */
function readEdgeCutCoordinate(
  working: TopologyWorkingGeometry,
  edge: { vertexA: number; vertexB: number },
  parameter: number,
): number {
  const start = working.positions[edge.vertexA];
  const end = working.positions[edge.vertexB];
  if (!start || !end) {
    throw new Error('edge endpoints are missing');
  }
  return start.x + (end.x - start.x) * parameter;
}

/**
 * Returns whether every selected vertex lies on the cut and the loop spans Y.
 *
 * @param coordinator Edit coordinator after the cut.
 * @param cutCoordinate Expected local X.
 * @returns True when the selection is the cut.
 */
function selectedVerticesShareCutX(coordinator: CoordinatorEditMode, cutCoordinate: number): boolean {
  const vertices = readSelectedVertexPositions(coordinator);
  if (!vertices) {
    return false;
  }
  return positionsShareCutX(vertices, cutCoordinate);
}

/**
 * Returns whether positions share a cut X and span Y.
 *
 * @param positions Selected positions.
 * @param cutCoordinate Expected local X.
 * @returns True when every position is on the cut and the loop is not a point.
 */
function positionsShareCutX(positions: readonly THREE.Vector3[], cutCoordinate: number): boolean {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    if (Math.abs(position.x - cutCoordinate) > 1e-4) {
      return false;
    }
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
  }
  return positions.length > 0 && maxY - minY > 0;
}

/**
 * Reads positions of the selected vertex components.
 *
 * @param coordinator Edit coordinator.
 * @returns Positions, or null when the selection is not brush vertices.
 */
function readSelectedVertexPositions(coordinator: CoordinatorEditMode): THREE.Vector3[] | null {
  const vertices = readEditedBrushVertices(coordinator);
  if (!vertices) {
    return null;
  }
  return collectSelectedVertexPositions(coordinator, vertices);
}

/**
 * Collects a position for every selected vertex.
 *
 * @param coordinator Edit coordinator.
 * @param vertices Brush vertices.
 * @returns Positions, or null when an entry is not a vertex.
 */
function collectSelectedVertexPositions(
  coordinator: CoordinatorEditMode,
  vertices: readonly THREE.Vector3[],
): THREE.Vector3[] | null {
  const positions: THREE.Vector3[] = [];
  for (const entry of coordinator.getSession().getComponentSelection().getSelected()) {
    const position = vertices[Number(entry.componentKey)];
    if (entry.kind !== 'vertex' || !position) {
      return null;
    }
    positions.push(position);
  }
  return positions;
}

/**
 * Returns whether every selected edge joins vertices on the cut.
 *
 * @param coordinator Edit coordinator in edge mode.
 * @param cutCoordinate Expected local X.
 * @returns True when both endpoints of every edge lie on the cut.
 */
function selectedEdgesShareCutX(coordinator: CoordinatorEditMode, cutCoordinate: number): boolean {
  const vertices = readEditedBrushVertices(coordinator);
  if (!vertices) {
    return false;
  }
  return everySelectedEdgeSharesCutX(coordinator, vertices, cutCoordinate);
}

/**
 * Checks each selected edge against the cut coordinate.
 *
 * @param coordinator Edit coordinator.
 * @param vertices Brush vertices.
 * @param cutCoordinate Expected local X.
 * @returns True when every edge lies on the cut.
 */
function everySelectedEdgeSharesCutX(
  coordinator: CoordinatorEditMode,
  vertices: readonly THREE.Vector3[],
  cutCoordinate: number,
): boolean {
  const selected = coordinator.getSession().getComponentSelection().getSelected();
  if (selected.length === 0) {
    return false;
  }
  for (const entry of selected) {
    if (entry.kind !== 'edge' || !edgeEndpointsShareCutX(vertices, entry.componentKey, cutCoordinate)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether both endpoints of an edge key lie on the cut.
 *
 * @param vertices Brush vertices.
 * @param edgeKey Undirected edge key.
 * @param cutCoordinate Expected local X.
 * @returns True when both endpoints match.
 */
function edgeEndpointsShareCutX(vertices: readonly THREE.Vector3[], edgeKey: string, cutCoordinate: number): boolean {
  const parts = edgeKey.split(':');
  const start = vertices[Number(parts[0])];
  const end = vertices[Number(parts[1])];
  if (!start || !end) {
    return false;
  }
  return Math.abs(start.x - cutCoordinate) <= 1e-4 && Math.abs(end.x - cutCoordinate) <= 1e-4;
}

/**
 * Reads vertices of the edited brush.
 *
 * @param coordinator Edit coordinator.
 * @returns Brush vertices, or null when the domain is not a brush.
 */
function readEditedBrushVertices(coordinator: CoordinatorEditMode): readonly THREE.Vector3[] | null {
  const target = coordinator.getSession().getDomain()[0];
  if (!target || target.kind !== 'brush') {
    return null;
  }
  const instance = target.solidModel.findBrush(target.brushId);
  if (!instance) {
    return null;
  }
  return instance.brush.vertices;
}

/**
 * Reads the kinds of the current component selection.
 *
 * @param coordinator Edit coordinator.
 * @returns Kind of each selected entry.
 */
function selectionKinds(coordinator: CoordinatorEditMode): string[] {
  return coordinator
    .getSession()
    .getComponentSelection()
    .getSelected()
    .map((entry) => entry.kind);
}
