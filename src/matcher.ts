/**
 * Pure matching logic — deliberately free of any `vscode` import so it can be
 * unit-tested with the plain node test runner.
 */

/** A ticket reference found in a line or document. */
export interface JiraMatch {
  /** Index of the first character of the reference within the scanned text. */
  index: number;
  /** Length of the matched text, e.g. `abc_384` is 7. */
  length: number;
  /** The matched text exactly as it appears, e.g. `abc_384`. */
  text: string;
  /** Normalised key, e.g. `ABC-384`. */
  key: string;
  /** Absolute URL the reference points at. */
  url: string;
}

export interface MatcherOptions {
  baseUrl: string;
  projectKeys: string[];
  /** Safety valve for pathological files; defaults to 5000. */
  maxMatches?: number;
}

const DEFAULT_MAX_MATCHES = 5000;

/**
 * Spans of `scheme://host...` in the scanned text.
 *
 * VS Code linkifies whole URLs itself, in both the editor and the terminal. A
 * reference inside one -- `https://org.atlassian.net/browse/ABC-382` -- would
 * otherwise get a second, overlapping link over the same characters, which
 * leaves the URL unclickable and visibly flickering as the editor picks between
 * the two. The URL already goes to the ticket, so ours adds nothing.
 */
const URL_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g;

function urlSpans(text: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  URL_PATTERN.lastIndex = 0;
  let found: RegExpExecArray | null;
  while ((found = URL_PATTERN.exec(text)) !== null) {
    spans.push([found.index, found.index + found[0].length] as const);
  }
  return spans;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keys that survive into the regex: trimmed, non-empty, letters/digits only.
 * Anything else would either break the alternation or match nonsense.
 */
function sanitiseKeys(projectKeys: string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const raw of projectKeys) {
    const key = String(raw ?? '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]*$/.test(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  // Longest first so the alternation prefers ABCDEF over ABC.
  return keys.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * Turn whatever the user typed into a base a key can be appended to.
 *
 * A bare host is the common case -- people know their Jira site, not the
 * `/browse/` convention -- so `yourorg.atlassian.net` becomes
 * `https://yourorg.atlassian.net/browse`. `/browse` is only added when the
 * input carries no path of its own; a deliberate path like
 * `https://example.com/tickets` is left alone, because appending to it would
 * silently break a working Jira Server or proxied setup.
 *
 * Returns `''` for anything that cannot be parsed, which callers treat as
 * unconfigured -- never as "match everything".
 */
export function normaliseBaseUrl(baseUrl: string): string {
  const trimmed = String(baseUrl ?? '').trim();
  if (!trimmed) {
    return '';
  }
  // Default the scheme rather than rejecting a bare host, but keep an explicit
  // one so an internal `http://` Jira still works.
  const withScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return '';
  }
  if (!url.hostname) {
    return '';
  }

  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path === '' ? '/browse' : path;
  // Drop anything after the path: a query or fragment cannot survive having
  // `/KEY` appended to it.
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/**
 * Parse a free-text key list (`"abc, xy PLATFORM"`) into canonical keys.
 * Shared by the setup command so it and the settings agree on what is valid.
 */
export function parseProjectKeys(input: string): string[] {
  return sanitiseKeys(String(input ?? '').split(/[\s,]+/));
}

/**
 * Compiled, reusable matcher. `null` from {@link createMatcher} means the
 * extension is unconfigured and should contribute no links at all.
 */
export class JiraMatcher {
  private readonly pattern: RegExp;

  constructor(
    private readonly baseUrl: string,
    readonly keys: readonly string[],
    private readonly maxMatches: number,
  ) {
    const alternation = keys.map(escapeRegExp).join('|');
    // A letter or digit immediately before the key means the key is just part
    // of a longer word, so `MYABC-1` is not a reference. Anything else --
    // underscore, slash, punctuation, start of text -- is a separator, so
    // `FOO_ABC-1` is one. That is a negative lookbehind rather than \b, because
    // `_` is a word character and \b would reject `FOO_ABC-1` along with it.
    //
    // Nothing constrains the trailing side: a reference keeps its meaning
    // whatever follows, so `ABC-123abc`, `ABC-123_4` and `ABC-123_some-slug`
    // all resolve to ABC-123. The digit run stays greedy, so `ABC-1234` is
    // ABC-1234 and never a truncated ABC-123 with a stray `4`.
    this.pattern = new RegExp(
      `(?<![A-Za-z0-9])(${alternation})[-_](\\d{1,10})`,
      'gi',
    );
  }

  /** Canonical `UPPER-N` form of a raw match. */
  static normaliseKey(key: string, number: string): string {
    return `${key.toUpperCase()}-${number}`;
  }

  urlFor(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /**
   * Every ticket reference in `text`, in order of appearance, excluding any
   * that sits inside a URL (see {@link urlSpans}).
   */
  findMatches(text: string): JiraMatch[] {
    const matches: JiraMatch[] = [];
    const spans = urlSpans(text);
    this.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.pattern.exec(text)) !== null) {
      const start = match.index;
      if (spans.some(([from, to]) => start >= from && start < to)) {
        continue;
      }
      const key = JiraMatcher.normaliseKey(match[1], match[2]);
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[0],
        key,
        url: this.urlFor(key),
      });
      if (matches.length >= this.maxMatches) {
        break;
      }
    }
    return matches;
  }
}

/**
 * Build a matcher, or `null` when either setting is missing — an empty base URL
 * or empty key whitelist means "do nothing", never "match everything".
 */
export function createMatcher(options: MatcherOptions): JiraMatcher | null {
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const keys = sanitiseKeys(options.projectKeys ?? []);
  if (!baseUrl || keys.length === 0) {
    return null;
  }
  return new JiraMatcher(baseUrl, keys, options.maxMatches ?? DEFAULT_MAX_MATCHES);
}
