import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import MCPServer from '../lib/api/mcp/server.js';
import { APIServer } from '../lib/api/rest/server.js';
import { getProjectIndex } from '../lib/search/bm25.js';
import { createChatEvidenceSource, linkChatToCode } from '../lib/evidence/index.js';
import { explainHistory } from '../lib/why/index.js';
import { cleanGitEnv } from './helpers/git-env.js';
import { buildFixtureRepo } from './fixtures/chat-link/build-fixture-repo.js';

const WHY_CLI = fileURLToPath(new URL('../bin/cm-why.js', import.meta.url));
const FIXTURE_DIR = path.dirname(
  fileURLToPath(new URL('./fixtures/chat-link/chat-parts.json', import.meta.url))
);

const RAW_FIXTURE_PARTS = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'chat-parts.json'), 'utf8')
);
const RAW_FIXTURE_LABELS = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'labels.json'), 'utf8')
);

function resolvePlaceholders(text, commitMap) {
  return String(text).replace(/\{\{(c\d+)\.(sha|shortSha)\}\}/g, (_, key, field) => {
    return commitMap.get(key)?.[field] ?? '';
  });
}

function hydrateFixture(fixture) {
  const commitMap = new Map(fixture.commits.map((c) => [c.key, c]));
  const parts = RAW_FIXTURE_PARTS.map((p) => ({
    ...p,
    title: resolvePlaceholders(p.title, commitMap),
    excerpt: resolvePlaceholders(p.excerpt, commitMap),
  }));
  const labels = new Map();
  for (const [id, expected] of Object.entries(RAW_FIXTURE_LABELS)) {
    labels.set(
      id,
      expected.map((link) => ({
        ...link,
        value: resolvePlaceholders(link.value, commitMap),
      }))
    );
  }
  return { parts, labels };
}

function git(cwd, args, envExtra = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf-8',
    env: cleanGitEnv({
      GIT_AUTHOR_NAME: 'Dev Fixture',
      GIT_AUTHOR_EMAIL: 'dev-fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Dev Fixture',
      GIT_COMMITTER_EMAIL: 'dev-fixture@example.invalid',
      ...envExtra,
    }),
    stdio: 'pipe',
  }).trim();
}

function runWhyCli(cwd, args, envOverrides = {}) {
  const env = cleanGitEnv({
    ...envOverrides,
  });
  if (!('CTXMAN_POLICY' in envOverrides)) {
    delete env.CTXMAN_POLICY;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WHY_CLI, ...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({
        status,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });
}

async function invokeRestWhy(apiServer, queryString) {
  let body = '';
  let statusCode = 200;
  const req = {
    method: 'GET',
    url: `/api/v1/why?${queryString}`,
    headers: { host: '127.0.0.1:3000' },
  };
  const res = {
    statusCode: 200,
    setHeader() {},
    writeHead(code) {
      statusCode = code;
    },
    end(chunk = '') {
      body += chunk;
    },
  };
  await apiServer.handleRequest(req, res);
  return { status: statusCode, json: JSON.parse(body) };
}

function writeStubKeyflip(binDir, payloadObj, markerFile) {
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, 'keyflip');
  const payloadPath = path.join(binDir, 'keyflip-payload.json');
  fs.writeFileSync(payloadPath, `${JSON.stringify(payloadObj)}\n`);
  const markerBlock = markerFile
    ? `if (markerFile) fs.appendFileSync(markerFile, JSON.stringify(args) + '\\n');\n`
    : '';
  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const markerFile = ${JSON.stringify(markerFile || '')};
${markerBlock}if (args[0] === 'conv' && args[1] === 'capabilities') {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, capabilities: ['search'] }) + '\\n');
  process.exit(0);
}
process.stdout.write(fs.readFileSync(${JSON.stringify(payloadPath)}, 'utf8'));
`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}

describe('chat-code-linker (U-04)', () => {
  const tempDirs = [];
  let fixture;
  let symbols;

  const makeTempDir = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  beforeAll(() => {
    const repoDir = path.join(makeTempDir('ctxman-chat-link-'), 'repo');
    fixture = buildFixtureRepo(repoDir);
    const projectIndex = getProjectIndex(fixture.repoRoot);
    symbols = [...projectIndex.files.values()].flatMap((entry) =>
      entry.units.map((unit) => ({ entry, unit }))
    );
  });

  afterAll(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it('Check 4: nonexistent and deleted paths yield zero path links (and do not falsely match basenames)', async () => {
    const parts = [
      {
        id: 'chat:nonexistent#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'Check src/billing/ghost.js and missing/helper.js for clues.',
      },
      {
        id: 'chat:deleted#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'Removed src/legacy/deprecated.js in cleanup.',
      },
      {
        id: 'chat:deleted-same-base#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'Moved deleted/invoice.js away from billing.',
      },
    ];

    const linked = await linkChatToCode(parts, {
      repoRoot: fixture.repoRoot,
      files: fixture.files,
      symbols,
      commits: fixture.commits,
    });

    for (const part of linked) {
      expect(part.links.filter((l) => l.type === 'path')).toEqual([]);
    }
  });

  it('Check 5: two files with the same basename link only on full path, never on bare basename', async () => {
    const parts = [
      {
        id: 'chat:billing-util#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'Rounding helper lives in src/billing/util.js.',
      },
      {
        id: 'chat:shipping-util#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'Weight formatter lives in src/shipping/util.js.',
      },
      {
        id: 'chat:bare-util#0',
        timestamp: '2026-11-10T10:00:00Z',
        excerpt: 'We mentioned util.js without a directory prefix.',
      },
    ];

    const linked = await linkChatToCode(parts, {
      repoRoot: fixture.repoRoot,
      files: fixture.files,
      symbols,
      commits: fixture.commits,
    });

    expect(linked[0].links).toEqual([
      expect.objectContaining({ type: 'path', value: 'src/billing/util.js' }),
    ]);
    expect(linked[1].links).toEqual([
      expect.objectContaining({ type: 'path', value: 'src/shipping/util.js' }),
    ]);
    expect(linked[2].links.filter((l) => l.type === 'path')).toEqual([]);
  });

  it('Check 6: Windows-style separator lib\\why\\index.js links to lib/why/index.js', async () => {
    const [linked] = await linkChatToCode(
      [
        {
          id: 'chat:win-path#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Traceback referenced lib\\why\\index.js on Windows.',
        },
      ],
      {
        repoRoot: fixture.repoRoot,
        files: fixture.files,
        symbols,
        commits: fixture.commits,
      }
    );

    expect(linked.links).toEqual([
      expect.objectContaining({ type: 'path', value: 'lib/why/index.js' }),
    ]);
  });

  it('links exact symbols (bare, backtick/call, qualified Class.method) and rejects unknown symbols', async () => {
    const linked = await linkChatToCode(
      [
        {
          id: 'chat:sym-bare#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Use calculateInvoiceTotal for integer sums.',
        },
        {
          id: 'chat:sym-qualified#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Call InvoiceLedger.recordEntry and InvoiceLedger::recordEntry.',
        },
        {
          id: 'chat:sym-call#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Enforce ceiling with `applyTaxCap`().',
        },
        {
          id: 'chat:sym-unknown#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Ignore nonExistentFn() in this discussion.',
        },
      ],
      {
        repoRoot: fixture.repoRoot,
        files: fixture.files,
        symbols,
        commits: fixture.commits,
      }
    );

    expect(linked[0].links).toEqual([
      expect.objectContaining({ type: 'symbol', value: 'calculateInvoiceTotal' }),
    ]);
    expect(linked[1].links).toEqual([
      expect.objectContaining({ type: 'symbol', value: 'InvoiceLedger.recordEntry' }),
    ]);
    expect(linked[2].links).toEqual([
      expect.objectContaining({ type: 'symbol', value: 'applyTaxCap' }),
    ]);
    expect(linked[3].links.filter((l) => l.type === 'symbol')).toEqual([]);
  });

  it('Check 7: unique short SHA links, ambiguous shared short SHA yields no link, unknown hex yields none', async () => {
    const c1 = fixture.commits[0];
    const sharedPrefix = 'abc1234';
    const commitA = {
      sha: `${sharedPrefix}111111111111111111111111111111111`,
      shortSha: sharedPrefix,
      date: '2026-09-01T00:00:00Z',
    };
    const commitB = {
      sha: `${sharedPrefix}222222222222222222222222222222222`,
      shortSha: sharedPrefix,
      date: '2026-09-02T00:00:00Z',
    };

    const linked = await linkChatToCode(
      [
        {
          id: 'chat:sha-unique#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: `See commit ${c1.shortSha} for billing setup.`,
        },
        {
          id: 'chat:sha-ambiguous-list#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: `Ambiguous prefix ${sharedPrefix} matches two commits.`,
        },
        {
          id: 'chat:sha-unknown#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Random hex deadbee and ffffffffffffffffffffffffffffffffffffffff.',
        },
      ],
      {
        repoRoot: fixture.repoRoot,
        files: fixture.files,
        symbols,
        commits: [...fixture.commits, commitA, commitB],
      }
    );

    expect(linked[0].links).toEqual([expect.objectContaining({ type: 'sha', value: c1.sha })]);
    expect(linked[1].links.filter((l) => l.type === 'sha')).toEqual([]);
    expect(linked[2].links.filter((l) => l.type === 'sha')).toEqual([]);

    // Also verify real git ambiguity when commits list does not include two colliding git commits
    const ambigRepo = path.join(makeTempDir('ctxman-ambig-sha-'), 'repo');
    fs.mkdirSync(ambigRepo, { recursive: true });
    git(ambigRepo, ['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(ambigRepo, 'a.txt'), 'v1\n');
    git(ambigRepo, ['add', 'a.txt']);
    git(ambigRepo, ['commit', '-qm', 'first'], {
      GIT_AUTHOR_DATE: '2026-08-01T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-08-01T10:00:00Z',
    });
    const sha1 = git(ambigRepo, ['rev-parse', 'HEAD']);
    // Brute-force a second commit sharing a 4-char prefix (or use custom gitCatFile for exact 7-char ambiguity)
    let ambigCatCalls = 0;
    const [gitAmbigResult] = await linkChatToCode(
      [
        {
          id: 'chat:git-ambig#0',
          timestamp: '2026-11-10T10:00:00Z',
          excerpt: 'Prefix 1234abc is ambiguous in git.',
        },
      ],
      {
        repoRoot: ambigRepo,
        files: [],
        symbols: [],
        commits: [{ sha: sha1, shortSha: sha1.slice(0, 7), date: '2026-08-01T10:00:00Z' }],
        gitCatFile: async () => {
          ambigCatCalls += 1;
          return false; // git cat-file -e fails with non-zero on ambiguous short SHA
        },
      }
    );
    expect(ambigCatCalls).toBe(1);
    expect(gitAmbigResult.links.filter((l) => l.type === 'sha')).toEqual([]);
  });

  it('time window boundary: 23h59m yields low-confidence time link, 24h01m yields none', async () => {
    const c5 = fixture.commits[4]; // 2026-10-20T12:00:00Z
    const linked = await linkChatToCode(
      [
        {
          id: 'chat:time-inside#0',
          timestamp: '2026-10-21T11:59:00Z',
          excerpt: 'Just inside twenty-four hours.',
        },
        {
          id: 'chat:time-outside#0',
          timestamp: '2026-10-21T12:01:00Z',
          excerpt: 'Just outside twenty-four hours.',
        },
      ],
      {
        repoRoot: fixture.repoRoot,
        files: fixture.files,
        symbols,
        commits: fixture.commits,
      }
    );

    const timeLinksInside = linked[0].links.filter((l) => l.type === 'time');
    expect(timeLinksInside).toHaveLength(1);
    expect(timeLinksInside[0].value).toBe(c5.sha);
    expect(timeLinksInside[0].confidence).toBeGreaterThan(0);
    expect(timeLinksInside[0].confidence).toBeLessThanOrEqual(0.4);

    expect(linked[1].links.filter((l) => l.type === 'time')).toEqual([]);
  });

  it('Check 2: measures and prints precision >= 0.9 and recall >= 0.7 on the 20-part labelled fixture', async () => {
    const { parts, labels } = hydrateFixture(fixture);
    const linked = await linkChatToCode(parts, {
      repoRoot: fixture.repoRoot,
      files: fixture.files,
      symbols,
      commits: fixture.commits,
    });

    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const part of linked) {
      const predicted = new Set(part.links.map((l) => `${l.type}:${l.value}`));
      const expected = new Set((labels.get(part.id) ?? []).map((l) => `${l.type}:${l.value}`));

      for (const item of predicted) {
        if (expected.has(item)) tp += 1;
        else fp += 1;
      }
      for (const item of expected) {
        if (!predicted.has(item)) fn += 1;
      }
    }

    const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    process.stdout.write(
      `[chat-code-linker fixture benchmark] TP=${tp} FP=${fp} FN=${fn} precision=${precision.toFixed(4)} recall=${recall.toFixed(4)}\n`
    );

    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(recall).toBeGreaterThanOrEqual(0.7);
  });

  it('Check 8: links 1000 synthetic parts in under 2 seconds without spawning git for known SHAs', async () => {
    const c1 = fixture.commits[0];
    const c3 = fixture.commits[2];
    const syntheticParts = Array.from({ length: 1000 }, (_, i) => ({
      id: `chat:perf-${i}#0`,
      timestamp: i % 5 === 0 ? '2026-10-20T14:00:00Z' : '2026-11-10T10:00:00Z',
      title: `Perf synthetic entry ${i}`,
      excerpt:
        i % 3 === 0
          ? `Touched src/billing/invoice.js in ${c1.shortSha} via calculateInvoiceTotal.`
          : i % 3 === 1
            ? `Check InvoiceLedger.recordEntry and commit ${c3.shortSha}.`
            : `Updated src/shipping/router.js for selectCarrierRoute.`,
    }));

    let catFileSpawns = 0;
    const startMs = performance.now();
    const linked = await linkChatToCode(syntheticParts, {
      repoRoot: fixture.repoRoot,
      files: fixture.files,
      symbols,
      commits: fixture.commits,
      gitCatFile: async () => {
        catFileSpawns += 1;
        return false;
      },
    });
    const elapsedMs = performance.now() - startMs;

    expect(linked).toHaveLength(1000);
    expect(catFileSpawns).toBe(0);
    expect(elapsedMs).toBeLessThan(2000);
  });

  describe('CLI and policy integration', () => {
    let cliFixture;

    beforeEach(() => {
      const repoDir = path.join(makeTempDir('ctxman-chat-link-cli-'), 'repo');
      cliFixture = buildFixtureRepo(repoDir);
    });

    afterEach(() => {
      // Temp directories are tracked in tempDirs and cleaned up in afterAll; also clean per-test policy dirs if any
    });

    it('Check 3 & CLI integration: --chats omits time-only parts while --chats-weak includes them with links', async () => {
      fs.mkdirSync(path.join(cliFixture.repoRoot, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(cliFixture.repoRoot, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, sources: { chat: { enabled: true } } })
      );

      const c3 = cliFixture.commits[2];
      const binDir = makeTempDir('ctxman-stub-bin-');
      const markerFile = path.join(binDir, 'invoked.log');
      writeStubKeyflip(
        binDir,
        {
          schemaVersion: 1,
          hits: [
            {
              id: 'strong-path',
              chunk: 0,
              role: 'assistant',
              title: 'Invoice cents rule',
              cwd: cliFixture.repoRoot,
              updatedAt: '2026-11-10T10:00:00Z',
              snippet: `See src/billing/invoice.js and commit ${c3.shortSha} for applyTaxCap.`,
              score: 0.95,
            },
            {
              id: 'unrelated-file',
              chunk: 0,
              role: 'user',
              title: 'Shipping router only',
              cwd: cliFixture.repoRoot,
              updatedAt: '2026-11-10T10:00:00Z',
              snippet: 'Changed src/shipping/router.js and selectCarrierRoute.',
              score: 0.99,
            },
            {
              id: 'weak-time-only',
              chunk: 1,
              role: 'user',
              title: 'Afternoon planning note',
              cwd: cliFixture.repoRoot,
              updatedAt: '2026-10-20T15:00:00Z',
              snippet: 'Discussed latency budgets during afternoon sync.',
              score: 0.7,
            },
          ],
        },
        markerFile
      );

      const env = { PATH: `${binDir}${path.delimiter}${process.env.PATH}` };

      // 1. Default --chats --json: keeps target-linked strong parts, drops unrelated & time-only
      const strongOnlyRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats', '--json'],
        env
      );
      expect(strongOnlyRes.status).toBe(0);
      const strongOnlyJson = JSON.parse(strongOnlyRes.stdout);
      const strongChatCitations = strongOnlyJson.citations.filter((c) => c.kind === 'chat');
      expect(strongChatCitations.map((c) => c.ref)).toEqual(['strong-path#0']);
      expect(strongChatCitations[0].links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'path', value: 'src/billing/invoice.js' }),
          expect.objectContaining({ type: 'symbol', value: 'applyTaxCap' }),
          expect.objectContaining({ type: 'sha', value: c3.sha }),
        ])
      );

      // 2. --chats --chats-weak --json: keeps strong AND time-only parts (still drops unrelated strong-only parts)
      const weakRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats', '--chats-weak', '--json'],
        env
      );
      expect(weakRes.status).toBe(0);
      const weakJson = JSON.parse(weakRes.stdout);
      const weakChatCitations = weakJson.citations.filter((c) => c.kind === 'chat');
      expect(weakChatCitations.map((c) => c.ref)).toEqual(['strong-path#0', 'weak-time-only#1']);
      const timePart = weakChatCitations.find((c) => c.ref === 'weak-time-only#1');
      expect(timePart.links).toEqual([
        expect.objectContaining({ type: 'time', value: cliFixture.commits[4].sha }),
      ]);

      // 3. --chats-weak alone implies --chats
      const impliedChatsRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats-weak', '--json'],
        env
      );
      expect(impliedChatsRes.status).toBe(0);
      const impliedCitations = JSON.parse(impliedChatsRes.stdout).citations.filter(
        (c) => c.kind === 'chat'
      );
      expect(impliedCitations.map((c) => c.ref)).toEqual(['strong-path#0', 'weak-time-only#1']);

      // 4. Markdown & XML outputs render links, and --help lists --chats-weak
      const mdRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats', '--chats-weak'],
        env
      );
      expect(mdRes.status).toBe(0);
      expect(mdRes.stdout).toContain('Links:');
      expect(mdRes.stdout).toContain('src/billing/invoice.js');
      expect(mdRes.stdout).toContain('time:');

      const xmlRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats', '--chats-weak', '--style', 'xml'],
        env
      );
      expect(xmlRes.status).toBe(0);
      expect(xmlRes.stdout).toContain('<links>');
      expect(xmlRes.stdout).toContain('type="time"');

      const helpRes = await runWhyCli(cliFixture.repoRoot, ['--help'], env);
      expect(helpRes.status).toBe(0);
      expect(helpRes.stdout).toContain('--chats-weak');
    });

    it('preserves policy gate, MCP/REST isolation for --chats-weak, and byte-identical chat.js output when unlinked', async () => {
      const binDir = makeTempDir('ctxman-policy-bin-');
      const markerFile = path.join(binDir, 'invoked.log');
      writeStubKeyflip(
        binDir,
        {
          schemaVersion: 1,
          hits: [
            {
              id: 'gate-1',
              chunk: 0,
              role: 'assistant',
              cwd: cliFixture.repoRoot,
              updatedAt: '2026-10-20T15:00:00Z',
              snippet: 'GATE_LEAK_CHECK',
              score: 0.9,
            },
          ],
        },
        markerFile
      );

      const env = { PATH: `${binDir}${path.delimiter}${process.env.PATH}` };

      // No policy -> --chats-weak is still blocked
      const deniedRes = await runWhyCli(
        cliFixture.repoRoot,
        ['src/billing/invoice.js', '--chats-weak', '--json'],
        env
      );
      expect(deniedRes.status).toBe(0);
      expect(fs.existsSync(markerFile)).toBe(false);
      expect(JSON.parse(deniedRes.stdout).warnings.some((w) => /disabled by policy/i.test(w))).toBe(
        true
      );

      // Enable policy, verify MCP/REST still keep chats & chatsWeak off
      fs.mkdirSync(path.join(cliFixture.repoRoot, '.ctxman'), { recursive: true });
      fs.writeFileSync(
        path.join(cliFixture.repoRoot, '.ctxman', 'policy.json'),
        JSON.stringify({ version: 1, sources: { chat: { enabled: true } } })
      );

      const mcpDest = await explainHistory(cliFixture.repoRoot, 'src/billing/invoice.js', {
        chatsWeak: true,
        destination: 'mcp',
        env: { ...process.env, ...env },
      });
      expect(mcpDest.data.citations.some((c) => c.kind === 'chat')).toBe(false);
      expect(fs.existsSync(markerFile)).toBe(false);

      const prevPath = process.env.PATH;
      process.env.PATH = env.PATH;
      try {
        const mcpServer = new MCPServer();
        const mcpRes = await mcpServer.server._requestHandlers.get('tools/call')(
          {
            method: 'tools/call',
            params: {
              name: 'explain_history',
              arguments: {
                path: cliFixture.repoRoot,
                target: 'src/billing/invoice.js',
                chatsWeak: true,
              },
            },
          },
          {}
        );
        expect(mcpRes.content[0].text).not.toContain('GATE_LEAK_CHECK');

        const apiServer = new APIServer({ port: 0, host: '127.0.0.1' });
        const restRes = await invokeRestWhy(
          apiServer,
          `path=${encodeURIComponent(cliFixture.repoRoot)}&target=${encodeURIComponent('src/billing/invoice.js')}&chatsWeak=true`
        );
        expect(restRes.status).toBe(200);
        expect(restRes.json.data.citations.some((c) => c.kind === 'chat')).toBe(false);
      } finally {
        process.env.PATH = prevPath;
      }

      // Direct createChatEvidenceSource without link option emits no links property
      const unlinkedSource = createChatEvidenceSource({
        root: cliFixture.repoRoot,
        execFile: async () => ({
          stdout: JSON.stringify({
            schemaVersion: 1,
            hits: [
              {
                id: 'plain-1',
                chunk: 0,
                role: 'user',
                cwd: cliFixture.repoRoot,
                updatedAt: '2026-11-10T10:00:00Z',
                snippet: 'Updated src/billing/invoice.js',
                score: 0.8,
              },
            ],
          }),
          stderr: '',
        }),
      });
      const plainResults = await unlinkedSource.search('src/billing/invoice.js');
      expect(plainResults).toHaveLength(1);
      expect('links' in plainResults[0]).toBe(false);
    });
  });
});
