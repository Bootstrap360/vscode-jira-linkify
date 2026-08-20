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

Run **Jira Linkify: Setup** from the command palette to be walked through both
settings, or set them by hand as below. The setup command accepts a bare host
and fills in the rest.

Both settings must be set; with either left empty the extension contributes no
links at all. That is deliberate — an unrestricted match would linkify `UTF_8`
and `SHA-1`.

| Setting | Type | Description |
| --- | --- | --- |
| `jiraLinks.baseUrl` | string | Jira site or base URL a key is appended to. A bare host such as `yourorg.atlassian.net` is accepted and becomes `https://yourorg.atlassian.net/browse` |
| `jiraLinks.projectKeys` | string[] | The project keys to linkify, e.g. `["ABC", "XY"]` |
| `jiraLinks.branchStatusBar` | boolean | Show status-bar links for the current branch's tickets. Default `true` |

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

### Finding your project keys

Jira has no anonymous project list, but you can fetch your own with an
[API token](https://id.atlassian.com/manage-profile/security/api-tokens). The
token stays in your shell — the extension never sees it and stores no
credentials.

```bash
export JIRA_SITE=yourorg.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=...
```

The projects you have used recently, which is usually what you want:

```bash
curl -fsSL -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://$JIRA_SITE/rest/api/3/project/recent?maxResults=20" \
  | jq '[.[].key] | sort'
```

Every project you can see. `project/search` is paginated and caps at 50 per
page, so a single unpaginated call silently truncates:

```bash
start=0; while :; do
  page=$(curl -fsSL -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
    "https://$JIRA_SITE/rest/api/3/project/search?startAt=$start&maxResults=50")
  jq -r '.values[].key' <<<"$page"
  [ "$(jq -r .isLast <<<"$page")" = true ] && break
  start=$((start + 50))
done | sort -u | jq -R . | jq -s .
```

Both print a JSON array ready to paste into `jiraLinks.projectKeys`.

> **Paste only the keys you actually use.** A large Jira site can expose
> hundreds of projects, many with two-letter keys, and adding them all makes
> the extension linkify unrelated strings such as `AR-15`. Keeping the list
> narrow is the whole point of the whitelist.

## What is and isn't matched

- Separator: `-` or `_`; the number is 1–10 digits.
- Anything may follow the number, so `ABC-123-some-slug`, `ABC-123_some_slug`,
  `ABC-123abc` and `feature/ABC-123_sdfsd` all link `ABC-123`. Every reference in
  the string is matched, not just the first.
- Anything except a letter or digit may precede the key, so `FOO_ABC-123` and
  `bugfix/ABC-123` both match.
- `MYABC-123` and `9ABC-123` do **not** match: a letter or digit immediately
  before the key means the key is part of a longer word, not a reference.
- The number is greedy, so `ABC-1234` links `ABC-1234`, never a truncated
  `ABC-123` with a stray `4`.
- The whitelist is what prevents false positives, not the surrounding text:
  `UTF_8` and `SHA-1` linkify only if you configure `UTF` or `SHA` as keys.
- A reference **inside a URL** is left alone, because VS Code already links the
  whole URL. Two overlapping links over the same characters would leave it
  unclickable. A reference elsewhere on the same line still links, and a
  markdown label like `[ABC-1](https://…/ABC-1)` links while its target does not.
- The longest configured key wins, so `ABCDEF-1` links as `ABCDEF-1` even when
  both `ABC` and `ABCDEF` are configured.
- Leading zeros are preserved: `ABC-0384` links to `ABC-0384`.

## Branch links

The ticket for the branch you are on appears in the status bar, and clicking it
opens the ticket. The key may sit anywhere in the branch name, so
`feature/ABC-123_some-slug` works as well as `ABC-123-some-slug`.

A branch naming more than one ticket gets one item per key, in the order they
appear. Past four they collapse into a single entry that opens a pick list.
On a detached HEAD, on a branch with no reference, or while the extension is
unconfigured, the item dims to "No Jira Linkify" so the button stays findable.

**Jira Linkify: Open ticket for current branch** does the same from the command
palette, and offers a pick list when the branch names several. Set
`jiraLinks.branchStatusBar` to `false` to keep editor and terminal links only.

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
