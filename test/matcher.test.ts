import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JiraMatcher,
  createMatcher,
  normaliseBaseUrl,
  parseProjectKeys,
} from '../src/matcher';

const BASE_URL = 'https://example.atlassian.net/browse/';
const KEYS = ['AIR', 'ASE', 'AL', 'AS', 'AIRWM3B', 'AIRSMG3R', 'CS'];

function matcher(overrides: Partial<{ baseUrl: string; projectKeys: string[] }> = {}) {
  const built = createMatcher({
    baseUrl: overrides.baseUrl ?? BASE_URL,
    projectKeys: overrides.projectKeys ?? KEYS,
  });
  assert.ok(built, 'expected a matcher to be built');
  return built as JiraMatcher;
}

function keysIn(text: string, m: JiraMatcher = matcher()): string[] {
  return m.findMatches(text).map((match) => match.key);
}

describe('createMatcher', () => {
  it('returns null when the base URL is empty', () => {
    assert.equal(createMatcher({ baseUrl: '', projectKeys: KEYS }), null);
  });

  it('returns null when the whitelist is empty', () => {
    assert.equal(createMatcher({ baseUrl: BASE_URL, projectKeys: [] }), null);
  });

  it('returns null when every configured key is malformed', () => {
    assert.equal(createMatcher({ baseUrl: BASE_URL, projectKeys: ['', '  ', '1AB', 'A-B'] }), null);
  });

  it('uppercases, trims and de-duplicates configured keys', () => {
    const built = matcher({ projectKeys: [' ase ', 'ASE', 'air'] });
    assert.deepEqual([...built.keys].sort(), ['AIR', 'ASE']);
  });
});

describe('separator and case variants', () => {
  it('matches the canonical uppercase form', () => {
    assert.deepEqual(keysIn('see ASE-384 for detail'), ['ASE-384']);
  });

  it('normalises lowercase to UPPER-N', () => {
    assert.deepEqual(keysIn('see ase-384 for detail'), ['ASE-384']);
  });

  it('normalises the underscore variant to a hyphen', () => {
    assert.deepEqual(keysIn('see ase_384 for detail'), ['ASE-384']);
  });

  it('normalises mixed case', () => {
    assert.deepEqual(keysIn('see AsE_384 for detail'), ['ASE-384']);
  });

  it('preserves leading zeros in the number', () => {
    assert.deepEqual(keysIn('ASE-0384'), ['ASE-0384']);
  });
});

describe('whitelist enforcement', () => {
  it('ignores keys outside the whitelist', () => {
    assert.deepEqual(keysIn('ticket XYZ-123 and ASE-1'), ['ASE-1']);
  });

  it('does not linkify UTF_8', () => {
    assert.deepEqual(keysIn('encoding UTF_8 here'), []);
  });

  it('does not linkify SHA-1', () => {
    assert.deepEqual(keysIn('hashed with SHA-1'), []);
  });

  it('prefers the longest matching key', () => {
    assert.deepEqual(keysIn('AIRWM3B-42 and AIRSMG3R-7 and AIR-1'), [
      'AIRWM3B-42',
      'AIRSMG3R-7',
      'AIR-1',
    ]);
  });
});

describe('boundaries', () => {
  it('rejects a key glued to preceding letters', () => {
    assert.deepEqual(keysIn('MYASE-123'), []);
  });

  it('matches a key preceded by an underscore, which is a separator', () => {
    assert.deepEqual(keysIn('FOO_ASE-123'), ['ASE-123']);
  });

  it('matches trailing letters or digits glued to the number', () => {
    assert.deepEqual(keysIn('ASE-123abc'), ['ASE-123']);
    assert.deepEqual(keysIn('ASE-123_4'), ['ASE-123']);
    assert.deepEqual(keysIn('ASE-123_4abc'), ['ASE-123']);
  });

  it('keeps the digit run greedy, so a longer number is not truncated', () => {
    assert.deepEqual(keysIn('ASE-1234'), ['ASE-1234']);
  });

  it('still rejects a key glued to preceding letters or digits', () => {
    assert.deepEqual(keysIn('MYASE-123'), []);
    assert.deepEqual(keysIn('9ASE-123'), []);
  });

  it('matches a trailing slug after either separator', () => {
    assert.deepEqual(keysIn('AIR-1100-sdfsakljd'), ['AIR-1100']);
    assert.deepEqual(keysIn('AIR-1100_sdfsakljd'), ['AIR-1100']);
  });

  it('matches inside a branch name with a trailing slug', () => {
    assert.deepEqual(keysIn('bugfix/ASE-374-cpd-spread'), ['ASE-374']);
    assert.deepEqual(keysIn('feature/AIR-1100_sdfsakljd'), ['AIR-1100']);
    assert.deepEqual(keysIn('release/v2.0.0-ASE-374_wip'), ['ASE-374']);
  });

  it('finds every key in a branch name, in order', () => {
    assert.deepEqual(keysIn('feature/AIR-1100_and-ASE-374_more'), ['AIR-1100', 'ASE-374']);
  });

  it('matches a one-character slug after either separator', () => {
    assert.deepEqual(keysIn('AIR-1100_x'), ['AIR-1100']);
    assert.deepEqual(keysIn('AIR-1100-x'), ['AIR-1100']);
  });

  it('matches at the very start and end of the text', () => {
    assert.deepEqual(keysIn('ASE-1'), ['ASE-1']);
  });

  it('matches inside surrounding punctuation', () => {
    assert.deepEqual(keysIn('(ASE-1), [cs_2] and "AL-3".'), ['ASE-1', 'CS-2', 'AL-3']);
  });

  it('skips a reference inside a URL, which VS Code already links itself', () => {
    assert.deepEqual(keysIn('https://example.atlassian.net/browse/ASE-9'), []);
    assert.deepEqual(keysIn('http://jira.internal:8080/browse/AIR-1'), []);
  });

  it('still matches references outside a URL on the same line', () => {
    assert.deepEqual(keysIn('see https://example.atlassian.net/browse/ASE-9 and ASE-10'), [
      'ASE-10',
    ]);
    assert.deepEqual(keysIn('Fixed ASE-9. Ref https://x/browse/AIR-1 too.'), ['ASE-9']);
  });

  it('matches a markdown link label without touching its target', () => {
    assert.deepEqual(keysIn('[ASE-1](https://example.atlassian.net/browse/ASE-1)'), ['ASE-1']);
  });
});

describe('match positions', () => {
  it('reports index, length and raw text', () => {
    const [match] = matcher().findMatches('fix ase_384 now');
    assert.equal(match.index, 4);
    assert.equal(match.length, 7);
    assert.equal(match.text, 'ase_384');
    assert.equal(match.key, 'ASE-384');
  });

  it('finds every occurrence in order, including repeats', () => {
    const text = 'ASE-1 then ase_2\nAIR-3 and ASE-1';
    assert.deepEqual(keysIn(text), ['ASE-1', 'ASE-2', 'AIR-3', 'ASE-1']);
  });

  it('stops at maxMatches', () => {
    const built = createMatcher({ baseUrl: BASE_URL, projectKeys: KEYS, maxMatches: 2 });
    assert.equal(built?.findMatches('ASE-1 ASE-2 ASE-3').length, 2);
  });
});

describe('URL building', () => {
  it('joins base URL and key with exactly one slash', () => {
    const [match] = matcher().findMatches('ase_384');
    assert.equal(match.url, 'https://example.atlassian.net/browse/ASE-384');
  });

  it('tolerates a base URL without a trailing slash', () => {
    const built = matcher({ baseUrl: 'https://example.atlassian.net/browse' });
    assert.equal(built.findMatches('ASE-1')[0].url, 'https://example.atlassian.net/browse/ASE-1');
  });

  it('collapses repeated trailing slashes', () => {
    const built = matcher({ baseUrl: 'https://example.atlassian.net/browse///' });
    assert.equal(built.findMatches('ASE-1')[0].url, 'https://example.atlassian.net/browse/ASE-1');
  });
});

describe('reuse', () => {
  it('does not leak regex state between calls', () => {
    const built = matcher();
    assert.deepEqual(built.findMatches('ASE-1').map((m) => m.key), ['ASE-1']);
    assert.deepEqual(built.findMatches('ASE-2').map((m) => m.key), ['ASE-2']);
  });
});

describe('normaliseBaseUrl', () => {
  it('adds https and /browse to a bare host', () => {
    assert.equal(normaliseBaseUrl('yourorg.atlassian.net'), 'https://yourorg.atlassian.net/browse');
  });

  it('adds /browse to a host that already has a scheme', () => {
    assert.equal(
      normaliseBaseUrl('https://yourorg.atlassian.net'),
      'https://yourorg.atlassian.net/browse',
    );
  });

  it('leaves an already-correct base alone, with or without a trailing slash', () => {
    assert.equal(
      normaliseBaseUrl('https://yourorg.atlassian.net/browse'),
      'https://yourorg.atlassian.net/browse',
    );
    assert.equal(
      normaliseBaseUrl('https://yourorg.atlassian.net/browse/'),
      'https://yourorg.atlassian.net/browse',
    );
  });

  it('keeps an explicit scheme and port', () => {
    assert.equal(normaliseBaseUrl('http://jira.internal:8080'), 'http://jira.internal:8080/browse');
  });

  it('does not append /browse to a path the user chose', () => {
    assert.equal(normaliseBaseUrl('https://example.com/tickets'), 'https://example.com/tickets');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(
      normaliseBaseUrl('  yourorg.atlassian.net  '),
      'https://yourorg.atlassian.net/browse',
    );
  });

  it('returns empty for input that cannot be a URL', () => {
    assert.equal(normaliseBaseUrl(''), '');
    assert.equal(normaliseBaseUrl('   '), '');
    assert.equal(normaliseBaseUrl('https://'), '');
  });
});

describe('parseProjectKeys', () => {
  it('splits on commas and whitespace, uppercases and de-duplicates', () => {
    assert.deepEqual(parseProjectKeys('abc, xy  PLATFORM, abc'), ['PLATFORM', 'ABC', 'XY']);
  });

  it('drops anything that is not a key', () => {
    assert.deepEqual(parseProjectKeys('ok2 9bad -- '), ['OK2']);
  });

  it('returns empty for empty input', () => {
    assert.deepEqual(parseProjectKeys(''), []);
  });
});
