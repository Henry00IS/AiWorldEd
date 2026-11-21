import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { InfiniteGrid3D } from '@/viewports/grid/infinite_grid_3d.js';
import { getActiveThemeViewportPalette } from '@/viewports/theme/theme_viewport_palette.js';
import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';
import { solidScriptNormalPickLabel } from './solid_script_normal_pick_label.js';
import { solidScriptNormalPickFaces, type SolidScriptNormalPickFace } from './solid_script_normal_pick_model.js';

/** A face and its coloured drawing. */
interface SolidScriptNormalPickDrawing {
  readonly face: SolidScriptNormalPickFace;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

/** 26 pickable faces, on the editor's floor grid. */
export class SolidScriptNormalPickScene {
  readonly scene = new THREE.Scene();
  readonly faces = solidScriptNormalPickFaces();
  private readonly grid = new InfiniteGrid3D(0.25);
  private readonly drawings: SolidScriptNormalPickDrawing[];

  /** Builds the shape and grid. */
  constructor() {
    this.scene.add(this.grid.getObject());
    this.drawings = this.faces.map((face) => this.faceDraw(face));
  }

  /**
   * Adds a filled face and its wire edge and label to the scene.
   *
   * @param face Face.
   * @returns Drawing.
   */
  private faceDraw(face: SolidScriptNormalPickFace): SolidScriptNormalPickDrawing {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        face.loop.flatMap((point) => point.toArray()),
        3,
      ),
    );
    geometry.setIndex(triangulateSimplePolygon3d(face.loop));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: face.color }));
    const edges = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([...face.loop]),
      new THREE.LineBasicMaterial({ color: getActiveThemeViewportPalette().boxEdgeColor }),
    );
    this.scene.add(mesh, edges);
    const label = solidScriptNormalPickLabel(face);
    if (label) this.scene.add(label);
    return { face, mesh };
  }

  /**
   * Highlights the face under the pointer, or removes the highlight.
   *
   * @param index Face number, or -1.
   */
  hover(index: number): void {
    this.drawings.forEach((drawing, face) =>
      drawing.mesh.material.color.set(face === index ? Theme.selectionColor : drawing.face.color),
    );
  }

  /**
   * Follows the view with the infinite grid.
   *
   * @param camera Camera.
   */
  update(camera: THREE.Camera): void {
    this.grid.update(camera);
  }

  /** Releases the shape's drawings and the grid. */
  dispose(): void {
    this.grid.dispose();
    for (const child of [...this.scene.children]) {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) continue;
      child.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
        material.dispose();
      }
    }
    this.scene.clear();
  }
}
