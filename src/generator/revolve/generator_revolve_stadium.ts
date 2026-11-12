import * as THREE from 'three';

/** Fewest faces across each round end of a stadium. */
const GENERATOR_REVOLVE_STADIUM_MIN_END_FACES = 2;

/**
 * Returns the faces across each round end: half the round side count, so the
 * ends match round sections of the same column.
 *
 * @param roundSides Side count of round sections.
 * @returns Faces per end.
 */
function generatorRevolveStadiumEndFaces(roundSides: number): number {
  return Math.max(GENERATOR_REVOLVE_STADIUM_MIN_END_FACES, Math.round(roundSides / 2));
}

/**
 * Returns the corner count of a stadium outline: each round end has one more
 * corner than faces, and one flat side joins the ends on each side.
 *
 * @param roundSides Side count of round sections.
 * @returns Ring corner count.
 */
export function generatorRevolveStadiumCorners(roundSides: number): number {
  return 2 * (generatorRevolveStadiumEndFaces(roundSides) + 1);
}

/**
 * Returns the corners of a stadium outline in winding order, starting at the
 * bottom of the +X end. The ends are half circles whose diameter is the depth,
 * joined by two flat sides along X.
 *
 * @param straight Flat side length as a fraction of the section width.
 * @param corners Ring corner count from {@link generatorRevolveStadiumCorners}.
 * @returns Outline corners before aspect scaling.
 */
export function generatorRevolveStadiumVertices(straight: number, corners: number): THREE.Vector2[] {
  const faces = Math.max(GENERATOR_REVOLVE_STADIUM_MIN_END_FACES, corners / 2 - 1);
  const radius = 1 - straight;
  const end = (centre: number, start: number) =>
    Array.from({ length: faces + 1 }, (_, step) => {
      const angle = start + (Math.PI * step) / faces;
      return new THREE.Vector2(centre + radius * Math.cos(angle), radius * Math.sin(angle));
    });
  return [...end(straight, -Math.PI / 2), ...end(-straight, Math.PI / 2)];
}
