/**
 * Pure matching logic — deliberately free of any `vscode` import so it can be
 * unit-tested with the plain node test runner.
 */

/** A ticket reference found in a line or document. */
export interface JiraMatch {
  /** Index of the first character of the reference within the scanned text. */
  index: number;
  /** Length of the matched text, e.g. `ase_384` is 7. */
  length: number;
  /** The matched text exactly as it appears, e.g. `ase_384`. */
  text: string;
  /** Normalised key, e.g. `ASE-384`. */
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

/** Strip trailing slashes so joining never produces `//`. */
function normaliseBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '').trim().replace(/\/+$/, '');
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
    // \b on both sides keeps `MYABC-1` and `ABC-12x` out; `_` is a word
    // character, so `FOO_ASE-1` is rejected too.
    this.pattern = new RegExp(`\\b(${alternation})[-_](\\d{1,10})\\b`, 'gi');
  }

  /** Canonical `UPPER-N` form of a raw match. */
  static normaliseKey(key: string, number: string): string {
    return `${key.toUpperCase()}-${number}`;
  }

  urlFor(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /** Every ticket reference in `text`, in order of appearance. */
  findMatches(text: string): JiraMatch[] {
    const matches: JiraMatch[] = [];
    this.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this.pattern.exec(text)) !== null) {
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
