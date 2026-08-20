# Changelog

All notable changes to this extension are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-20

First stable release. The feature set is settled — editor links, terminal links,
branch status-bar links and the setup command — and the settings are considered
stable from here.

### Changed

- No functional change since 0.2.1. Test fixtures and code comments now use
  generic project keys (`ABC`, `XY`) rather than one organisation's real ones.

## [0.2.1] - 2026-08-20

### Changed

- The branch status bar items now use the link icon rather than the git branch
  icon, so they stand apart from the built-in branch indicator.
- On a detached HEAD, a branch with no ticket reference, or an unconfigured
  extension, the status bar shows a dimmed "No Jira Linkify" item instead of
  nothing, so the button stays findable.

## [0.2.0] - 2026-08-20

### Added

- Editor links via `DocumentLinkProvider`, registered for all schemes and
  languages: ctrl/cmd+click a ticket reference to open it.
- Integrated-terminal links via `TerminalLinkProvider`, opening in the default
  browser.
- Case- and separator-insensitive matching: `ABC-123`, `abc-123`, `abc_123` and
  `AbC_123` all normalise to `ABC-123`.
- References are found wherever they appear, so branch-shaped strings linkify:
  anything may follow the number and anything but a letter or digit may precede
  the key, making `ABC-123_some_slug`, `ABC-123abc` and `FOO_ABC-123` all link
  `ABC-123`. Only a key glued to preceding letters or digits (`MYABC-123`) is
  rejected.
- Settings `jiraLinks.baseUrl` and `jiraLinks.projectKeys`, both `resource`
  scoped so a repository's `.vscode/settings.json` wins, and both re-read on
  change without a reload.
- A required project-key whitelist, so non-ticket tokens such as `UTF_8` and
  `SHA-1` are never linkified.
- A `Jira Linkify: Setup` command that walks through both settings, accepts a
  bare Jira host, and offers to save to the workspace or your user settings.
- `jiraLinks.baseUrl` accepts a bare host: `yourorg.atlassian.net` resolves to
  `https://yourorg.atlassian.net/browse`. A base URL with a path of its own is
  left as given.
- Status-bar links for the tickets named by the current git branch, one per key
  in branch order, collapsing into a pick list past four. A
  `Jira Linkify: Open ticket for current branch` command does the same from the
  palette, and `jiraLinks.branchStatusBar` turns the items off.

### Fixed

- A reference inside a URL is no longer linkified. VS Code links whole URLs
  itself, so the overlapping link left pasted browse URLs unclickable and
  flickering.
