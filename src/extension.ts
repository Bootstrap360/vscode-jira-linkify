import * as vscode from 'vscode';

import { MatcherProvider } from './config';
import { JiraDocumentLinkProvider } from './documentLinkProvider';

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
}

export function deactivate(): void {
  // Everything is registered through context.subscriptions.
}
