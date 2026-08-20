/**
 * Branch-name logic, deliberately free of any `vscode` import so it can be
 * unit-tested with the plain node test runner.
 */
import { JiraMatcher } from './matcher';

/** A ticket referenced by the current branch name. */
export interface BranchTicket {
  /** Normalised key, e.g. `AIR-1100`. */
  key: string;
  /** Absolute URL the key points at. */
  url: string;
}

/**
 * Above this many, one item per ticket would crowd the status bar out, so they
 * collapse into a single entry that opens a pick list instead.
 */
export const MAX_STATUS_BAR_ITEMS = 4;

export function shouldCollapse(count: number): boolean {
  return count > MAX_STATUS_BAR_ITEMS;
}

/**
 * Every distinct reference in a branch name, in order of appearance, so
 * `feature/AIR-1100_and-ASE-374` yields both. A key repeated in the same branch
 * yields one entry: two identical status-bar links would be noise.
 */
export function ticketsInBranch(
  branch: string | undefined,
  matcher: JiraMatcher | null,
): BranchTicket[] {
  if (!branch || !matcher) {
    return [];
  }
  const seen = new Set<string>();
  const tickets: BranchTicket[] = [];
  for (const match of matcher.findMatches(branch)) {
    if (seen.has(match.key)) {
      continue;
    }
    seen.add(match.key);
    tickets.push({ key: match.key, url: match.url });
  }
  return tickets;
}
