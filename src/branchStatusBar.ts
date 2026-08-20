import * as vscode from 'vscode';

import { BranchTicket, shouldCollapse, ticketsInBranch } from './branch';
import { CONFIG_SECTION, MatcherProvider } from './config';

export const OPEN_BRANCH_TICKET_COMMAND = 'jiraLinks.openBranchTicket';

/**
 * The slice of the built-in git extension's API this needs. Unlike most
 * extensions, `vscode.git` returns a real API object from `activate()`, so this
 * rests on a supported surface rather than on reading someone else's settings.
 */
interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD?: { readonly name?: string };
    readonly onDidChange: vscode.Event<void>;
  };
}

interface GitApi {
  readonly repositories: readonly GitRepository[];
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
  readonly onDidCloseRepository: vscode.Event<GitRepository>;
}

interface GitExtension {
  getAPI(version: 1): GitApi;
}

/**
 * One status-bar item per ticket referenced by the current branch name.
 *
 * Everything is rebuilt on each render rather than diffed: there are at most a
 * handful of items, and a stale item pointing at the previous branch's ticket
 * is worse than a rebuild.
 */
export class BranchStatusBar implements vscode.Disposable {
  private readonly items: vscode.StatusBarItem[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repoSubscriptions = new Map<string, vscode.Disposable>();
  private api: GitApi | undefined;

  constructor(private readonly matchers: MatcherProvider) {}

  /** A no-op when the git extension is absent, which is legitimate. */
  async start(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      return;
    }
    const git = extension.isActive ? extension.exports : await extension.activate();
    this.api = git.getAPI(1);

    this.disposables.push(
      this.api.onDidOpenRepository((repo) => {
        this.watch(repo);
        this.render();
      }),
      this.api.onDidCloseRepository((repo) => {
        const key = repo.rootUri.toString();
        this.repoSubscriptions.get(key)?.dispose();
        this.repoSubscriptions.delete(key);
        this.render();
      }),
      // Which repository is "current" follows the active editor in a multi-root
      // workspace, so the items have to follow it too.
      vscode.window.onDidChangeActiveTextEditor(() => this.render()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIG_SECTION)) {
          this.render();
        }
      }),
    );

    for (const repo of this.api.repositories) {
      this.watch(repo);
    }
    this.render();
  }

  /** Re-render on branch switches, commits, anything moving HEAD. */
  private watch(repo: GitRepository): void {
    const key = repo.rootUri.toString();
    this.repoSubscriptions.get(key)?.dispose();
    this.repoSubscriptions.set(
      key,
      repo.state.onDidChange(() => this.render()),
    );
  }

  /**
   * The repository the active editor sits in; the longest matching root wins so
   * a nested repository beats its parent. Falls back to the first repository,
   * which is the whole answer in the single-repo case.
   */
  private currentRepository(): GitRepository | undefined {
    const repos = this.api?.repositories ?? [];
    if (repos.length === 0) {
      return undefined;
    }
    const active = vscode.window.activeTextEditor?.document.uri.toString();
    if (active) {
      const containing = repos
        .filter((repo) => active.startsWith(repo.rootUri.toString()))
        .sort((a, b) => b.rootUri.toString().length - a.rootUri.toString().length)[0];
      if (containing) {
        return containing;
      }
    }
    return repos[0];
  }

  /** Tickets on the current branch. Shared with the command. */
  tickets(): BranchTicket[] {
    const repo = this.currentRepository();
    if (!repo) {
      return [];
    }
    return ticketsInBranch(repo.state.HEAD?.name, this.matchers.get(repo.rootUri));
  }

  private render(): void {
    this.clear();
    const enabled = vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<boolean>('branchStatusBar', true);
    if (!enabled) {
      return;
    }

    if (!this.currentRepository()) {
      return;
    }

    const tickets = this.tickets();
    if (tickets.length === 0) {
      // Detached HEAD, no match, or unconfigured: keep the button findable but
      // visibly inactive.
      const item = this.createItem(1);
      item.text = '$(link) No Jira Linkify';
      item.color = new vscode.ThemeColor('descriptionForeground');
      item.tooltip = 'No ticket reference in the current branch name';
      item.command = OPEN_BRANCH_TICKET_COMMAND;
      item.show();
      return;
    }

    if (shouldCollapse(tickets.length)) {
      const item = this.createItem(1);
      item.text = `$(link) ${tickets.length} tickets`;
      item.tooltip = tickets.map((ticket) => ticket.key).join(', ');
      item.command = OPEN_BRANCH_TICKET_COMMAND;
      item.show();
      return;
    }

    // Higher priority sits further left, so counting down keeps the keys in
    // branch-name order.
    tickets.forEach((ticket, index) => {
      const item = this.createItem(tickets.length - index);
      item.text = `$(link) ${ticket.key}`;
      item.tooltip = `Open ${ticket.key}`;
      item.command = {
        command: OPEN_BRANCH_TICKET_COMMAND,
        title: `Open ${ticket.key}`,
        arguments: [ticket.url],
      };
      item.show();
    });
  }

  private createItem(priority: number): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    this.items.push(item);
    return item;
  }

  private clear(): void {
    for (const item of this.items) {
      item.dispose();
    }
    this.items.length = 0;
  }

  dispose(): void {
    this.clear();
    for (const subscription of this.repoSubscriptions.values()) {
      subscription.dispose();
    }
    this.repoSubscriptions.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

/** Open directly when unambiguous, otherwise ask which one. */
export async function openBranchTicket(bar: BranchStatusBar, url?: string): Promise<void> {
  if (url) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }

  const tickets = bar.tickets();
  if (tickets.length === 0) {
    vscode.window.showInformationMessage(
      'Jira Linkify: no ticket reference in the current branch name.',
    );
    return;
  }
  if (tickets.length === 1) {
    await vscode.env.openExternal(vscode.Uri.parse(tickets[0].url));
    return;
  }

  const picked = await vscode.window.showQuickPick(
    tickets.map((ticket) => ({ label: ticket.key, description: ticket.url, url: ticket.url })),
    { title: 'Jira Linkify: open which ticket?' },
  );
  if (picked) {
    await vscode.env.openExternal(vscode.Uri.parse(picked.url));
  }
}
