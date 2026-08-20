# Changelog

All notable changes to this extension are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-19

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
