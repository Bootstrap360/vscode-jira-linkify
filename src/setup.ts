import * as vscode from 'vscode';

import { CONFIG_SECTION } from './config';
import { normaliseBaseUrl, parseProjectKeys } from './matcher';

export const SETUP_COMMAND = 'jiraLinks.setup';

/**
 * Where to write. With no folder open there is nowhere but user settings, so
 * don't ask a question with one answer.
 */
async function pickTarget(): Promise<vscode.ConfigurationTarget | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return vscode.ConfigurationTarget.Global;
  }
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: 'This workspace',
        description: 'writes .vscode/settings.json, so the repo carries it',
        target: vscode.ConfigurationTarget.Workspace,
      },
      {
        label: 'My user settings',
        description: 'applies everywhere on this machine',
        target: vscode.ConfigurationTarget.Global,
      },
    ],
    { title: 'Jira Linkify (3 of 3): where should this be saved?', ignoreFocusOut: true },
  );
  return picked?.target;
}

/**
 * Walks through the two settings and writes them. Both are validated as typed,
 * so the wizard cannot produce a configuration that contributes no links.
 */
export async function runSetup(): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const rawUrl = await vscode.window.showInputBox({
    title: 'Jira Linkify (1 of 3): your Jira site',
    prompt: 'A bare host is fine — https and /browse are filled in for you.',
    placeHolder: 'yourorg.atlassian.net',
    value: config.get<string>('baseUrl', ''),
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' || normaliseBaseUrl(value) !== ''
        ? undefined
        : 'That cannot be read as a URL.',
  });
  if (rawUrl === undefined) {
    return;
  }
  const baseUrl = normaliseBaseUrl(rawUrl);
  if (baseUrl === '') {
    vscode.window.showWarningMessage('Jira Linkify: no site given, so links stay off.');
    return;
  }

  const rawKeys = await vscode.window.showInputBox({
    title: 'Jira Linkify (2 of 3): project keys',
    prompt: 'Spaces or commas between them. Only these keys are ever linkified.',
    placeHolder: 'ABC XY PLATFORM',
    value: config.get<string[]>('projectKeys', []).join(' '),
    ignoreFocusOut: true,
    validateInput: (value) =>
      parseProjectKeys(value).length > 0
        ? undefined
        : 'Give at least one key: a letter, then letters or digits.',
  });
  if (rawKeys === undefined) {
    return;
  }
  const projectKeys = parseProjectKeys(rawKeys);

  const target = await pickTarget();
  if (target === undefined) {
    return;
  }

  await config.update('baseUrl', baseUrl, target);
  await config.update('projectKeys', projectKeys, target);

  vscode.window.showInformationMessage(
    `Jira Linkify: ${projectKeys.join(', ')} now link to ${baseUrl}/<KEY>.`,
  );
}
