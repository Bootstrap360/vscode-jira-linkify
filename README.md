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

```bash
npm install
npm run compile   # tsc -> out/
npm test          # compile + node --test out/test/
npm run lint
npm run package   # vsce package -> jira-linkify-<version>.vsix
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with the
extension loaded.

## Licence

[MIT](LICENSE)
