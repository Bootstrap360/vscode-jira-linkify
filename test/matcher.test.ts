import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JiraMatcher,
  createMatcher,
  normaliseBaseUrl,
  parseProjectKeys,
} from '../src/matcher';

const BASE_URL = 'https://example.atlassian.net/browse/';
const KEYS = ['XY', 'ABC', 'QA', 'ZZ', 'XYLONGA', 'XYLONGB', 'KQ'];

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
    const built = matcher({ projectKeys: [' abc ', 'ABC', 'xy'] });
    assert.deepEqual([...built.keys].sort(), ['ABC', 'XY']);
  });
});

describe('separator and case variants', () => {
  it('matches the canonical uppercase form', () => {
    assert.deepEqual(keysIn('see ABC-384 for detail'), ['ABC-384']);
  });

  it('normalises lowercase to UPPER-N', () => {
    assert.deepEqual(keysIn('see abc-384 for detail'), ['ABC-384']);
  });

  it('normalises the underscore variant to a hyphen', () => {
    assert.deepEqual(keysIn('see abc_384 for detail'), ['ABC-384']);
  });

  it('normalises mixed case', () => {
    assert.deepEqual(keysIn('see AbC_384 for detail'), ['ABC-384']);
  });

  it('preserves leading zeros in the number', () => {
    assert.deepEqual(keysIn('ABC-0384'), ['ABC-0384']);
  });
});

describe('whitelist enforcement', () => {
  it('ignores keys outside the whitelist', () => {
    assert.deepEqual(keysIn('ticket XYZ-123 and ABC-1'), ['ABC-1']);
  });

  it('does not linkify UTF_8', () => {
    assert.deepEqual(keysIn('encoding UTF_8 here'), []);
  });

  it('does not linkify SHA-1', () => {
    assert.deepEqual(keysIn('hashed with SHA-1'), []);
  });

  it('prefers the longest matching key', () => {
    assert.deepEqual(keysIn('XYLONGA-42 and XYLONGB-7 and XY-1'), [
      'XYLONGA-42',
      'XYLONGB-7',
      'XY-1',
    ]);
  });
});

describe('boundaries', () => {
  it('rejects a key glued to preceding letters', () => {
    assert.deepEqual(keysIn('MYABC-123'), []);
  });

  it('matches a key preceded by an underscore, which is a separator', () => {
    assert.deepEqual(keysIn('FOO_ABC-123'), ['ABC-123']);
  });

  it('matches trailing letters or digits glued to the number', () => {
    assert.deepEqual(keysIn('ABC-123abc'), ['ABC-123']);
    assert.deepEqual(keysIn('ABC-123_4'), ['ABC-123']);
    assert.deepEqual(keysIn('ABC-123_4abc'), ['ABC-123']);
  });

  it('keeps the digit run greedy, so a longer number is not truncated', () => {
    assert.deepEqual(keysIn('ABC-1234'), ['ABC-1234']);
  });

  it('still rejects a key glued to preceding letters or digits', () => {
    assert.deepEqual(keysIn('MYABC-123'), []);
    assert.deepEqual(keysIn('9ABC-123'), []);
  });

  it('matches a trailing slug after either separator', () => {
    assert.deepEqual(keysIn('XY-1100-sdfsakljd'), ['XY-1100']);
    assert.deepEqual(keysIn('XY-1100_sdfsakljd'), ['XY-1100']);
  });

  it('matches inside a branch name with a trailing slug', () => {
    assert.deepEqual(keysIn('bugfix/ABC-374-cpd-spread'), ['ABC-374']);
    assert.deepEqual(keysIn('feature/XY-1100_sdfsakljd'), ['XY-1100']);
    assert.deepEqual(keysIn('release/v2.0.0-ABC-374_wip'), ['ABC-374']);
  });

  it('finds every key in a branch name, in order', () => {
    assert.deepEqual(keysIn('feature/XY-1100_and-ABC-374_more'), ['XY-1100', 'ABC-374']);
  });

  it('matches a one-character slug after either separator', () => {
    assert.deepEqual(keysIn('XY-1100_x'), ['XY-1100']);
    assert.deepEqual(keysIn('XY-1100-x'), ['XY-1100']);
  });

  it('matches at the very start and end of the text', () => {
    assert.deepEqual(keysIn('ABC-1'), ['ABC-1']);
  });

  it('matches inside surrounding punctuation', () => {
    assert.deepEqual(keysIn('(ABC-1), [kq_2] and "QA-3".'), ['ABC-1', 'KQ-2', 'QA-3']);
  });

  it('skips a reference inside a URL, which VS Code already links itself', () => {
    assert.deepEqual(keysIn('https://example.atlassian.net/browse/ABC-9'), []);
    assert.deepEqual(keysIn('http://jira.internal:8080/browse/XY-1'), []);
  });

  it('still matches references outside a URL on the same line', () => {
    assert.deepEqual(keysIn('see https://example.atlassian.net/browse/ABC-9 and ABC-10'), [
      'ABC-10',
    ]);
    assert.deepEqual(keysIn('Fixed ABC-9. Ref https://x/browse/XY-1 too.'), ['ABC-9']);
  });

  it('matches a markdown link label without touching its target', () => {
    assert.deepEqual(keysIn('[ABC-1](https://example.atlassian.net/browse/ABC-1)'), ['ABC-1']);
  });
});

describe('match positions', () => {
  it('reports index, length and raw text', () => {
    const [match] = matcher().findMatches('fix abc_384 now');
    assert.equal(match.index, 4);
    assert.equal(match.length, 7);
    assert.equal(match.text, 'abc_384');
    assert.equal(match.key, 'ABC-384');
  });

  it('finds every occurrence in order, including repeats', () => {
    const text = 'ABC-1 then abc_2\nXY-3 and ABC-1';
    assert.deepEqual(keysIn(text), ['ABC-1', 'ABC-2', 'XY-3', 'ABC-1']);
  });

  it('stops at maxMatches', () => {
    const built = createMatcher({ baseUrl: BASE_URL, projectKeys: KEYS, maxMatches: 2 });
    assert.equal(built?.findMatches('ABC-1 ABC-2 ABC-3').length, 2);
  });
});

describe('URL building', () => {
  it('joins base URL and key with exactly one slash', () => {
    const [match] = matcher().findMatches('abc_384');
    assert.equal(match.url, 'https://example.atlassian.net/browse/ABC-384');
  });

  it('tolerates a base URL without a trailing slash', () => {
    const built = matcher({ baseUrl: 'https://example.atlassian.net/browse' });
    assert.equal(built.findMatches('ABC-1')[0].url, 'https://example.atlassian.net/browse/ABC-1');
  });

  it('collapses repeated trailing slashes', () => {
    const built = matcher({ baseUrl: 'https://example.atlassian.net/browse///' });
    assert.equal(built.findMatches('ABC-1')[0].url, 'https://example.atlassian.net/browse/ABC-1');
  });
});

describe('reuse', () => {
  it('does not leak regex state between calls', () => {
    const built = matcher();
    assert.deepEqual(built.findMatches('ABC-1').map((m) => m.key), ['ABC-1']);
    assert.deepEqual(built.findMatches('ABC-2').map((m) => m.key), ['ABC-2']);
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
