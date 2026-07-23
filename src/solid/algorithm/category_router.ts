import { SolidOperation } from '../types/solid_operation.js';
import { SurfaceCategory } from '../types/surface_category.js';

/**
 * Category routing tables for ordered solid CSG operations.
 * Six-category model distinguishes subject-owned surfaces from peer coplanar
 * contact so coplanar additive faces cancel instead of z-fighting.
 *
 * Table indices follow SurfaceCategory enum order:
 * Inside, Aligned, SelfAligned, SelfReverseAligned, ReverseAligned, Outside.
 */
export class CategoryRouter {
  private static readonly ADDITIVE_TABLE: SurfaceCategory[][] = [
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside
    ],
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Aligned
    ],
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.SelfAligned
    ],
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.SelfReverseAligned
    ],
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.Inside,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.ReverseAligned
    ],
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.Outside
    ]
  ];

  private static readonly SUBTRACTIVE_TABLE: SurfaceCategory[][] = [
    [
      SurfaceCategory.Outside,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Aligned,
      SurfaceCategory.Inside
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Aligned,
      SurfaceCategory.Aligned,
      SurfaceCategory.Aligned
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Aligned,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.SelfReverseAligned
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.ReverseAligned
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside
    ]
  ];

  private static readonly INTERSECTING_TABLE: SurfaceCategory[][] = [
    [
      SurfaceCategory.Inside,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.Outside
    ],
    [
      SurfaceCategory.Aligned,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside
    ],
    [
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Aligned,
      SurfaceCategory.SelfAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside
    ],
    [
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.Outside
    ],
    [
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.SelfReverseAligned,
      SurfaceCategory.ReverseAligned,
      SurfaceCategory.Outside
    ],
    [
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside,
      SurfaceCategory.Outside
    ]
  ];

  /**
   * Routes two surface categories through a solid operation.
   * @param leftCategory Category from the left / accumulated operand.
   * @param rightCategory Category relative to the right operand brush.
   * @param operation CSG operation of the right operand.
   * @returns Combined category.
   */
  static route(
    leftCategory: SurfaceCategory,
    rightCategory: SurfaceCategory,
    operation: SolidOperation
  ): SurfaceCategory {
    const table = this.tableForOperation(operation);
    return table[leftCategory][rightCategory];
  }

  /**
   * Selects the routing table for an operation.
   * @param operation Solid operation.
   * @returns Category table indexed by SurfaceCategory.
   */
  private static tableForOperation(operation: SolidOperation): SurfaceCategory[][] {
    if (operation === SolidOperation.Additive) return this.ADDITIVE_TABLE;
    if (operation === SolidOperation.Subtractive) return this.SUBTRACTIVE_TABLE;
    return this.INTERSECTING_TABLE;
  }
}
