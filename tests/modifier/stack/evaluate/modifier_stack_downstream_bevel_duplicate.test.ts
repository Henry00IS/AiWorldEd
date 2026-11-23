import { describe } from 'vitest';
import { downstreamBevelChains, upstreamKindsOf } from './modifier_stack_downstream_bevel_fixture.js';

/** Chains that start with a duplicating modifier. */
describe('bevel settings after earlier modifiers', { timeout: 60000 }, () => {
  downstreamBevelChains(upstreamKindsOf('duplicate'));
});
