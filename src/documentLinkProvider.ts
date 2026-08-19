import * as vscode from 'vscode';

import { MatcherProvider } from './config';

/** Skip pathologically large documents rather than stalling the UI. */
const MAX_DOCUMENT_LENGTH = 2 * 1024 * 1024;

export class JiraDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly matchers: MatcherProvider) {}

  provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.DocumentLink[] {
    const matcher = this.matchers.get(document.uri);
    if (!matcher) {
      return [];
    }

    const text = document.getText();
    if (text.length > MAX_DOCUMENT_LENGTH) {
      return [];
    }

    const links: vscode.DocumentLink[] = [];
    for (const match of matcher.findMatches(text)) {
      if (token.isCancellationRequested) {
        return [];
      }
      const range = new vscode.Range(
        document.positionAt(match.index),
        document.positionAt(match.index + match.length),
      );
      const link = new vscode.DocumentLink(range, vscode.Uri.parse(match.url));
      link.tooltip = `Open ${match.key}`;
      links.push(link);
    }
    return links;
  }
}
