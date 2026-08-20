import * as vscode from 'vscode';

import { BranchStatusBar, OPEN_BRANCH_TICKET_COMMAND, openBranchTicket } from './branchStatusBar';
import { MatcherProvider } from './config';
import { JiraDocumentLinkProvider } from './documentLinkProvider';
import { SETUP_COMMAND, runSetup } from './setup';
import { JiraTerminalLinkProvider } from './terminalLinkProvider';

export function activate(context: vscode.ExtensionContext): void {
  const matchers = new MatcherProvider();
  context.subscriptions.push(matchers);

  context.subscriptions.push(
    // `scheme: '*'` covers untitled buffers, diffs and virtual documents too.
    vscode.languages.registerDocumentLinkProvider(
      { scheme: '*' },
      new JiraDocumentLinkProvider(matchers),
    ),
  );

  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(new JiraTerminalLinkProvider(matchers)),
  );

  const branchStatusBar = new BranchStatusBar(matchers);
  context.subscriptions.push(branchStatusBar);
  // Waits on the git extension activating, which must not hold up ours.
  void branchStatusBar.start();

  context.subscriptions.push(
    vscode.commands.registerCommand(SETUP_COMMAND, () => runSetup()),
    vscode.commands.registerCommand(OPEN_BRANCH_TICKET_COMMAND, (url?: string) =>
      openBranchTicket(branchStatusBar, url),
    ),
  );
}

export function deactivate(): void {
  // Everything is registered through context.subscriptions.
}
