import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cleanGitEnv } from '../../helpers/git-env.js';

function git(cwd, args, dateIso) {
  const env = cleanGitEnv({
    GIT_AUTHOR_NAME: 'Dev Fixture',
    GIT_AUTHOR_EMAIL: 'dev-fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Dev Fixture',
    GIT_COMMITTER_EMAIL: 'dev-fixture@example.invalid',
    ...(dateIso ? { GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso } : {}),
  });
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

function writeRepoFile(repoRoot, relPath, content) {
  const abs = path.join(repoRoot, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

function commitInfo(repoRoot, key, date, subject) {
  const sha = git(repoRoot, ['rev-parse', 'HEAD']);
  const shortSha = git(repoRoot, ['rev-parse', '--short=7', 'HEAD']);
  return { key, sha, shortSha, date, subject };
}

/**
 * Build an invented 5-commit fixture repository at `targetDir`:
 * - Two files with the same basename (`src/billing/util.js` and `src/shipping/util.js`)
 * - One deleted file (`src/legacy/deprecated.js`, deleted in commit 4)
 * - Strictly invented symbols, paths, and synthetic author metadata
 *
 * @param {string} targetDir
 * @returns {{
 *   repoRoot: string,
 *   commits: Array<{ key: string, sha: string, shortSha: string, date: string, subject: string }>,
 *   files: string[],
 *   deletedFiles: string[],
 * }}
 */
export function buildFixtureRepo(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  git(targetDir, ['init', '-q', '-b', 'main']);

  const commits = [];

  // Commit 1: initial billing + shipping modules (including duplicate basename util.js)
  writeRepoFile(
    targetDir,
    'src/billing/invoice.js',
    [
      'export function calculateInvoiceTotal(items) {',
      '  return items.reduce((sum, item) => sum + item.amountCents, 0);',
      '}',
      '',
      'export class InvoiceLedger {',
      '  recordEntry(id, cents) {',
      '    return { id, cents };',
      '  }',
      '}',
      '',
    ].join('\n')
  );
  writeRepoFile(
    targetDir,
    'src/billing/util.js',
    ['export function roundCents(value) {', '  return Math.round(value);', '}', ''].join('\n')
  );
  writeRepoFile(
    targetDir,
    'src/shipping/util.js',
    ['export function formatParcelWeight(grams) {', '  return `${grams}g`;', '}', ''].join('\n')
  );
  git(targetDir, ['add', '.']);
  const d1 = '2026-10-01T10:00:00Z';
  const s1 = 'feat: add billing invoice and shared util modules';
  git(targetDir, ['commit', '-qm', s1], d1);
  commits.push(commitInfo(targetDir, 'c1', d1, s1));

  // Commit 2: legacy module (to be deleted later) and lib/why/index.js
  writeRepoFile(
    targetDir,
    'src/legacy/deprecated.js',
    ['export function legacyRate(base) {', '  return base * 1.1;', '}', ''].join('\n')
  );
  writeRepoFile(
    targetDir,
    'lib/why/index.js',
    ['export function explainNode(nodeId) {', '  return `node:${nodeId}`;', '}', ''].join('\n')
  );
  git(targetDir, ['add', '.']);
  const d2 = '2026-10-05T14:00:00Z';
  const s2 = 'feat: add legacy module and why explainer node';
  git(targetDir, ['commit', '-qm', s2], d2);
  commits.push(commitInfo(targetDir, 'c2', d2, s2));

  // Commit 3: add applyTaxCap to src/billing/invoice.js
  writeRepoFile(
    targetDir,
    'src/billing/invoice.js',
    [
      'export function calculateInvoiceTotal(items) {',
      '  return items.reduce((sum, item) => sum + item.amountCents, 0);',
      '}',
      '',
      'export function applyTaxCap(amount, maxTax) {',
      '  return Math.min(amount, maxTax);',
      '}',
      '',
      'export class InvoiceLedger {',
      '  recordEntry(id, cents) {',
      '    return { id, cents };',
      '  }',
      '}',
      '',
    ].join('\n')
  );
  git(targetDir, ['add', 'src/billing/invoice.js']);
  const d3 = '2026-10-10T09:00:00Z';
  const s3 = 'feat(billing): enforce applyTaxCap ceiling';
  git(targetDir, ['commit', '-qm', s3], d3);
  commits.push(commitInfo(targetDir, 'c3', d3, s3));

  // Commit 4: delete src/legacy/deprecated.js
  git(targetDir, ['rm', '-q', 'src/legacy/deprecated.js']);
  const d4 = '2026-10-15T16:00:00Z';
  const s4 = 'chore: remove deprecated legacy rate module';
  git(targetDir, ['commit', '-qm', s4], d4);
  commits.push(commitInfo(targetDir, 'c4', d4, s4));

  // Commit 5: add shipping router and update invoice comment
  writeRepoFile(
    targetDir,
    'src/shipping/router.js',
    [
      'export function selectCarrierRoute(zone) {',
      "  return zone === 'west' ? 'route-w' : 'route-e';",
      '}',
      '',
    ].join('\n')
  );
  writeRepoFile(
    targetDir,
    'src/billing/invoice.js',
    [
      '// Updated for carrier router integration',
      'export function calculateInvoiceTotal(items) {',
      '  return items.reduce((sum, item) => sum + item.amountCents, 0);',
      '}',
      '',
      'export function applyTaxCap(amount, maxTax) {',
      '  return Math.min(amount, maxTax);',
      '}',
      '',
      'export class InvoiceLedger {',
      '  recordEntry(id, cents) {',
      '    return { id, cents };',
      '  }',
      '}',
      '',
    ].join('\n')
  );
  git(targetDir, ['add', '.']);
  const d5 = '2026-10-20T12:00:00Z';
  const s5 = 'feat(shipping): add carrier route selector';
  git(targetDir, ['commit', '-qm', s5], d5);
  commits.push(commitInfo(targetDir, 'c5', d5, s5));

  return {
    repoRoot: fs.realpathSync(targetDir),
    commits,
    files: [
      'lib/why/index.js',
      'src/billing/invoice.js',
      'src/billing/util.js',
      'src/shipping/router.js',
      'src/shipping/util.js',
    ],
    deletedFiles: ['src/legacy/deprecated.js'],
  };
}
