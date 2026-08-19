# Jira Linkify

Turns Jira ticket references into clickable links — in the **editor** and in the
**integrated terminal**.

Most Jira link extensions do one or the other, and only recognise the canonical
uppercase-with-hyphen form. This one covers both surfaces and normalises the
variants that show up in real branch names, log lines and commit messages:

| You write | It links to |
| --- | --- |
| `ABC-123` | `<baseUrl>/ABC-123` |
| `abc-123` | `<baseUrl>/ABC-123` |
| `abc_123` | `<baseUrl>/ABC-123` |
| `AbC_123` | `<baseUrl>/ABC-123` |

In the editor, ctrl+click (cmd+click on macOS) the reference. In the terminal,
hover and click — the link opens in your default browser, where your existing
Jira session applies.

## Configuration

Both settings must be set; with either left empty the extension contributes no
links at all. That is deliberate — an unrestricted match would linkify `UTF_8`
and `SHA-1`.

| Setting | Type | Description |
| --- | --- | --- |
| `jiraLinks.baseUrl` | string | Base URL a ticket key is appended to, e.g. `https://yourorg.atlassian.net/browse/` |
| `jiraLinks.projectKeys` | string[] | The project keys to linkify, e.g. `["ABC", "XY"]` |

Both are `resource`-scoped, so per-repository `.vscode/settings.json` wins over
your user settings — useful when you work across Jira instances.

```jsonc
// .vscode/settings.json
{
  "jiraLinks.baseUrl": "https://yourorg.atlassian.net/browse/",
  "jiraLinks.projectKeys": ["ABC", "XY", "PLATFORM"]
}
```

Keys are matched case-insensitively, and configured keys are normalised
(trimmed, uppercased, de-duplicated), so `["abc", "ABC "]` behaves as `["ABC"]`.
Changes take effect immediately — no reload.

## What is and isn't matched

- Separator: `-` or `_`; the number is 1–10 digits.
- Word boundaries are enforced: `MYABC-123`, `FOO_ABC-123`, `ABC-123abc` and
  `ABC-123_4` do **not** match.
- A trailing slug does: `bugfix/ABC-374-some-slug` links `ABC-374`.
- The longest configured key wins, so `ABCDEF-1` links as `ABCDEF-1` even when
  both `ABC` and `ABCDEF` are configured.
- Leading zeros are preserved: `ABC-0384` links to `ABC-0384`.

## Limitations

- The VS Code API exposes link providers for text documents and terminals only.
  The **Output panel and Debug Console are not covered** — there is no extension
  API for them.
- Very large documents (over 2 MB) are skipped to keep the editor responsive,
  and at most 5000 references are linked per document.

## Privacy

No network requests, no credentials, no telemetry. The extension only builds a
URL string and asks VS Code to open it.

## Development

The repo ships a dev container (**Dev Containers: Reopen in Container**) with
node, npm, `gh` and the Claude Code CLI preinstalled; it bind-mounts `~/.ssh`,
`~/.claude` and `~/repos`, and runs `npm ci` on create. Working outside it is
fine too — everything below only needs node 20.

```bash
npm install
npm run compile   # tsc -> out/
npm test          # compile + node --test out/test/
npm run lint
npm run package   # vsce package -> jira-linkify-<version>.vsix
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with the
extension loaded.

## Releasing

Publishing is automated by `.github/workflows/publish.yml` and runs on a version
tag:

```bash
# bump "version" in package.json and update CHANGELOG.md first
git tag v1.0.1
git push origin v1.0.1
```

The workflow lints, tests, checks the tag against `package.json` (a mismatch
fails the run), packages the `.vsix` and publishes it. A manual run from the
Actions tab does everything *except* publish, uploading the `.vsix` as an
artefact — useful for rehearsing a release.

It needs one repository secret, `VSCE_PAT`: an Azure DevOps token scoped to
*Marketplace → Manage* across *all accessible organisations*. Set it with
`gh secret set VSCE_PAT` (paste at the prompt, never as a command argument).

> ⚠️ Marketplace versions can never be reused — a bad publish means bumping the
> patch version, not replacing the tag. Note also that global Azure DevOps PATs
> stop working on 2026-12-01; publishing then moves to Microsoft Entra ID via
> `vsce publish --azure-credential`, which needs `@vscode/vsce` 3.9.2 or newer.

## Licence

[MIT](LICENSE)
