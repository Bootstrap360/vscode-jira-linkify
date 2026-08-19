/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Exercises the two providers against a stub `vscode` module, so the wiring
 * (config scoping, cache invalidation, ranges, openExternal) is covered without
 * launching an Extension Development Host.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { beforeEach, describe, it } from 'node:test';

const BASE_URL = 'https://example.atlassian.net/browse/';
const KEYS = ['ASE', 'AIR', 'CS'];

// ---------------------------------------------------------------- stub vscode

class Position {
  constructor(readonly offset: number) {}
}

class Range {
  constructor(readonly start: Position, readonly end: Position) {}
}

class Uri {
  private constructor(readonly value: string) {}
  static parse(value: string): Uri {
    return new Uri(value);
  }
  toString(): string {
    return this.value;
  }
}

class DocumentLink {
  tooltip?: string;
  constructor(readonly range: Range, readonly target: Uri) {}
}

/** Settings the stub serves, and the listeners watching them. */
const state = {
  baseUrl: BASE_URL,
  projectKeys: KEYS as string[],
  /** Records the scope argument of the most recent getConfiguration call. */
  lastScope: undefined as unknown,
  opened: [] as string[],
  listeners: [] as ((event: any) => void)[],
};

const vscodeStub = {
  Position,
  Range,
  Uri,
  DocumentLink,
  workspace: {
    getConfiguration(_section: string, scope: unknown) {
      state.lastScope = scope;
      return {
        get(key: string, fallback: unknown) {
          if (key === 'baseUrl') {
            return state.baseUrl;
          }
          if (key === 'projectKeys') {
            return state.projectKeys;
          }
          return fallback;
        },
      };
    },
    onDidChangeConfiguration(listener: (event: any) => void) {
      state.listeners.push(listener);
      return { dispose: () => undefined };
    },
  },
  window: {
    registerTerminalLinkProvider: () => ({ dispose: () => undefined }),
  },
  languages: {
    registerDocumentLinkProvider: () => ({ dispose: () => undefined }),
  },
  env: {
    openExternal(uri: Uri) {
      state.opened.push(uri.toString());
      return Promise.resolve(true);
    },
  },
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function patched(request: string, ...rest: unknown[]) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, ...rest);
};

/* eslint-disable @typescript-eslint/no-var-requires */
const { MatcherProvider } = require('../src/config');
const { JiraDocumentLinkProvider } = require('../src/documentLinkProvider');
const { JiraTerminalLinkProvider } = require('../src/terminalLinkProvider');
/* eslint-enable @typescript-eslint/no-var-requires */

// ----------------------------------------------------------------- helpers

function fireConfigChange(section = 'jiraLinks') {
  for (const listener of state.listeners) {
    listener({ affectsConfiguration: (candidate: string) => candidate === section });
  }
}

function fakeDocument(text: string, uri: unknown = { path: '/repo/file.txt' }) {
  return {
    uri,
    getText: () => text,
    positionAt: (offset: number) => new Position(offset),
  };
}

const TOKEN = { isCancellationRequested: false };

beforeEach(() => {
  state.baseUrl = BASE_URL;
  state.projectKeys = [...KEYS];
  state.lastScope = undefined;
  state.opened = [];
  state.listeners = [];
});

// ------------------------------------------------------------------- tests

describe('JiraDocumentLinkProvider', () => {
  it('produces a link with the right range, target and tooltip', () => {
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    const links = provider.provideDocumentLinks(fakeDocument('fix ase_384 today'), TOKEN);

    assert.equal(links.length, 1);
    assert.equal(links[0].range.start.offset, 4);
    assert.equal(links[0].range.end.offset, 11);
    assert.equal(links[0].target.toString(), `${BASE_URL}ASE-384`);
    assert.equal(links[0].tooltip, 'Open ASE-384');
  });

  it('links every variant in one document', () => {
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    const links = provider.provideDocumentLinks(
      fakeDocument('ASE-384 ase-384 ase_384 AsE_384'),
      TOKEN,
    );
    assert.deepEqual(
      links.map((link: any) => link.target.toString()),
      Array(4).fill(`${BASE_URL}ASE-384`),
    );
  });

  it('scopes configuration lookup to the document uri', () => {
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    const uri = { path: '/repo/other.txt' };
    provider.provideDocumentLinks(fakeDocument('ASE-1', uri), TOKEN);
    assert.equal(state.lastScope, uri);
  });

  it('returns nothing when unconfigured', () => {
    state.baseUrl = '';
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    assert.deepEqual(provider.provideDocumentLinks(fakeDocument('ASE-1'), TOKEN), []);
  });

  it('returns nothing once cancelled', () => {
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    const cancelled = { isCancellationRequested: true };
    assert.deepEqual(provider.provideDocumentLinks(fakeDocument('ASE-1'), cancelled), []);
  });

  it('skips documents over the size limit', () => {
    const provider = new JiraDocumentLinkProvider(new MatcherProvider());
    const huge = `ASE-1 ${'x'.repeat(2 * 1024 * 1024)}`;
    assert.deepEqual(provider.provideDocumentLinks(fakeDocument(huge), TOKEN), []);
  });
});

describe('JiraTerminalLinkProvider', () => {
  it('links ASE-384, ase-384 and ase_384 from one terminal line', () => {
    const provider = new JiraTerminalLinkProvider(new MatcherProvider());
    const links = provider.provideTerminalLinks({ line: 'ASE-384 ase-384 ase_384' });

    assert.deepEqual(
      links.map((link: any) => link.url),
      Array(3).fill(`${BASE_URL}ASE-384`),
    );
    assert.deepEqual(
      links.map((link: any) => [link.startIndex, link.length]),
      [
        [0, 7],
        [8, 7],
        [16, 7],
      ],
    );
    assert.deepEqual(
      links.map((link: any) => link.tooltip),
      Array(3).fill('Open ASE-384'),
    );
  });

  it('opens the ticket externally when a link is handled', () => {
    const provider = new JiraTerminalLinkProvider(new MatcherProvider());
    const [link] = provider.provideTerminalLinks({ line: 'see cs_139' });
    provider.handleTerminalLink(link);
    assert.deepEqual(state.opened, [`${BASE_URL}CS-139`]);
  });

  it('returns nothing when unconfigured', () => {
    state.projectKeys = [];
    const provider = new JiraTerminalLinkProvider(new MatcherProvider());
    assert.deepEqual(provider.provideTerminalLinks({ line: 'ASE-1' }), []);
  });
});

describe('MatcherProvider caching', () => {
  it('reuses one compiled matcher for repeated lookups', () => {
    const matchers = new MatcherProvider();
    assert.equal(matchers.get(), matchers.get());
  });

  it('picks up new settings after a jiraLinks configuration change', () => {
    const provider = new JiraTerminalLinkProvider(new MatcherProvider());
    assert.deepEqual(provider.provideTerminalLinks({ line: 'XYZ-1' }), []);

    state.projectKeys = ['XYZ'];
    fireConfigChange();

    assert.deepEqual(
      provider.provideTerminalLinks({ line: 'XYZ-1' }).map((link: any) => link.url),
      [`${BASE_URL}XYZ-1`],
    );
  });

  it('ignores configuration changes to other sections', () => {
    const matchers = new MatcherProvider();
    const before = matchers.get();
    fireConfigChange('editor');
    assert.equal(matchers.get(), before);
  });
});
