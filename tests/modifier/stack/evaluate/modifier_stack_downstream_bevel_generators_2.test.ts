import { describe } from 'vitest';
import { downstreamBevelChains, generatorKindsPart } from './modifier_stack_downstream_bevel_fixture.js';

/** Chains that start with a generator, part 2 of 3. */
describe('bevel settings after earlier modifiers', { timeout: 60000 }, () => {
  downstreamBevelChains(generatorKindsPart(1));
});
