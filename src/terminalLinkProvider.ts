import * as vscode from 'vscode';

import { MatcherProvider } from './config';

export interface JiraTerminalLink extends vscode.TerminalLink {
  url: string;
}

export class JiraTerminalLinkProvider
  implements vscode.TerminalLinkProvider<JiraTerminalLink>
{
  constructor(private readonly matchers: MatcherProvider) {}

  provideTerminalLinks(context: vscode.TerminalLinkContext): JiraTerminalLink[] {
    // Terminals have no resource scope, so this resolves workspace settings.
    const matcher = this.matchers.get();
    if (!matcher) {
      return [];
    }

    return matcher.findMatches(context.line).map((match) => ({
      startIndex: match.index,
      length: match.length,
      tooltip: `Open ${match.key}`,
      url: match.url,
    }));
  }

  handleTerminalLink(link: JiraTerminalLink): void {
    void vscode.env.openExternal(vscode.Uri.parse(link.url));
  }
}
