import { modifierStackRandomValue } from '@/modifier/stack/kinds/array/modifier_stack_array_random.js';

/** Deterministic stream of uniform values for one seed and one input brush. */
export class PhysicsShatterRandom {
  private counter = 0;

  /**
   * Creates a stream.
   *
   * @param seed Integer fracture seed.
   * @param stream Stream number, such as the input brush index.
   */
  constructor(
    private readonly seed: number,
    private readonly stream: number,
  ) {}

  /**
   * Returns the next value in [0, 1), the same on every machine.
   *
   * @returns Uniform value.
   */
  next(): number {
    this.counter++;
    return modifierStackRandomValue(this.seed, this.stream, this.counter, 7);
  }

  /**
   * Returns the next value in [min, max).
   *
   * @param min Inclusive lower end.
   * @param max Exclusive upper end.
   * @returns Uniform value.
   */
  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
