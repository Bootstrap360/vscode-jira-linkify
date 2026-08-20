import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_STATUS_BAR_ITEMS, shouldCollapse, ticketsInBranch } from '../src/branch';
import { createMatcher } from '../src/matcher';

const BASE_URL = 'https://example.atlassian.net/browse/';
const KEYS = ['XY', 'ABC', 'KQ'];

const matcher = createMatcher({ baseUrl: BASE_URL, projectKeys: KEYS });
assert.ok(matcher, 'expected a matcher to be built');

function keysIn(branch: string | undefined): string[] {
  return ticketsInBranch(branch, matcher).map((ticket) => ticket.key);
}

describe('ticketsInBranch', () => {
  it('finds a key wherever it sits in the branch name', () => {
    assert.deepEqual(keysIn('feature/XY-1100_sdfsakljd'), ['XY-1100']);
    assert.deepEqual(keysIn('XY-1100'), ['XY-1100']);
    assert.deepEqual(keysIn('release/v2.0.0-ABC-374_wip'), ['ABC-374']);
  });

  it('returns one entry per distinct key, in order of appearance', () => {
    assert.deepEqual(keysIn('feature/XY-1100_and-ABC-374_more'), ['XY-1100', 'ABC-374']);
  });

  it('de-duplicates a key repeated in the same branch', () => {
    assert.deepEqual(keysIn('feature/XY-1100_rework-XY-1100'), ['XY-1100']);
  });

  it('builds the URL from the configured base', () => {
    assert.deepEqual(ticketsInBranch('feature/XY-1100_x', matcher), [
      { key: 'XY-1100', url: 'https://example.atlassian.net/browse/XY-1100' },
    ]);
  });

  it('returns nothing for a branch with no reference', () => {
    assert.deepEqual(keysIn('main'), []);
    assert.deepEqual(keysIn('feature/no-ticket-here'), []);
  });

  it('returns nothing without a branch or a matcher', () => {
    assert.deepEqual(keysIn(undefined), []);
    assert.deepEqual(keysIn(''), []);
    assert.deepEqual(ticketsInBranch('feature/XY-1100', null), []);
  });
});

describe('shouldCollapse', () => {
  it('collapses only past the item cap', () => {
    assert.equal(shouldCollapse(0), false);
    assert.equal(shouldCollapse(MAX_STATUS_BAR_ITEMS), false);
    assert.equal(shouldCollapse(MAX_STATUS_BAR_ITEMS + 1), true);
  });
});
