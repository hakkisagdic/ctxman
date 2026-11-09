#!/usr/bin/env node
/**
 * Audit Command
 * Print the export audit log written while a policy enables `audit`
 */

import path from 'path';
import {
  auditLogFiles,
  readAuditLog,
  readWorkspaceAuditLogs,
  filterAuditEvents,
  formatAuditTable,
  parseSince,
  DEFAULT_AUDIT_PATH,
  POLICY_FILE,
} from '../lib/policy/index.js';

const DEFAULT_TABLE_LIMIT = 50;

function collectRepos(args) {
  const repos = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--repo') {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--repo needs a value');
      }
      repos.push(value);
    } else if (arg.startsWith('--repo=')) {
      const value = arg.slice('--repo='.length);
      if (!value) {
        throw new Error('--repo needs a value');
      }
      repos.push(value);
    }
  }
  return repos;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const json = args.includes('--json');
  let since = null;
  let limit = json ? 0 : DEFAULT_TABLE_LIMIT;
  let file = null;
  let repos = [];

  try {
    const sinceValue = valueOf(args, '--since');
    if (sinceValue !== undefined) since = parseSince(sinceValue);

    const limitValue = valueOf(args, '--limit');
    if (limitValue !== undefined) {
      if (!/^\d+$/.test(limitValue)) {
        throw new Error(`Invalid --limit value ${JSON.stringify(limitValue)}: expected 0 or more`);
      }
      limit = Number(limitValue);
    }

    file = valueOf(args, '--file') ?? null;
    repos = collectRepos(args);
    if (file && repos.length > 0) {
      throw new Error('Cannot combine --file and --repo');
    }
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (repos.length > 0) {
    runWorkspaceAudit({ repos, since, limit, json });
    return;
  }

  const files = file ? [path.resolve(file)] : auditFiles();
  const { events, skipped, missing } = readAuditLog(files);
  const selected = filterAuditEvents(events, { since, limit });

  if (json) {
    console.log(JSON.stringify(selected, null, 2));
  } else if (missing.length === files.length) {
    console.log(`No audit log found (${files.join(', ')}).`);
    console.log(
      `Exports are logged while ${POLICY_FILE} has "audit": {"enabled": true} (ctxman policy init).`
    );
  } else if (selected.length === 0) {
    console.log(
      since ? `No exports recorded since ${since.toISOString()}.` : 'No exports recorded.'
    );
  } else {
    console.log(formatAuditTable(selected));
    console.log();
    const matching = filterAuditEvents(events, { since }).length;
    const shown =
      selected.length < matching
        ? `Showing the last ${selected.length} of ${matching} events (--limit 0 shows all)`
        : `${selected.length} event${selected.length === 1 ? '' : 's'}`;
    console.log(`${shown} from ${files.filter((f) => !missing.includes(f)).join(', ')}`);
  }

  if (skipped > 0) {
    console.error(
      `⚠️  Skipped ${skipped} line${skipped === 1 ? '' : 's'} that are not JSON events`
    );
  }
}

function runWorkspaceAudit({ repos, since, limit, json }) {
  let result;
  try {
    result = readWorkspaceAuditLogs(process.cwd(), repos, { since, limit });
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 2;
    return;
  }

  for (const err of result.policyErrors) {
    console.error(`⚠️  [${err.repo}] ${err.message}`);
  }

  if (json) {
    console.log(JSON.stringify(result.events, null, 2));
  } else if (result.files.length === 0) {
    console.log(`No audit logs found across ${result.repos.length} repositories.`);
    console.log(
      `Exports are logged while ${POLICY_FILE} has "audit": {"enabled": true} (ctxman policy init).`
    );
  } else if (result.events.length === 0) {
    console.log(
      since ? `No exports recorded since ${since.toISOString()}.` : 'No exports recorded.'
    );
  } else {
    console.log(formatAuditTable(result.events));
    console.log();
    const shown =
      result.events.length < result.total
        ? `Showing the last ${result.events.length} of ${result.total} events (--limit 0 shows all)`
        : `${result.events.length} event${result.events.length === 1 ? '' : 's'}`;
    console.log(`${shown} across ${result.repos.length} repositories (${result.files.join(', ')})`);
  }

  if (result.skippedLines > 0) {
    console.error(
      `⚠️  Skipped ${result.skippedLines} line${result.skippedLines === 1 ? '' : 's'} that are not JSON events`
    );
  }
}

// The policy's audit logs; the default location when no policy names one
function auditFiles() {
  const { files, error } = auditLogFiles(process.cwd());
  if (error) {
    console.error(`⚠️  ${error.message}`);
    console.error(`   Reading the default log ${DEFAULT_AUDIT_PATH} instead.`);
  }
  return files;
}

function valueOf(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value`);
  }
  return value;
}

function printHelp() {
  console.log('ctxman audit - show the export audit log\n');
  console.log('Usage: ctxman audit [options]\n');
  console.log('Options:');
  console.log('  --repo DIR           Include another repository in the merged audit log');
  console.log('                       (repeatable)');
  console.log('  --since DATE         Only exports at or after DATE: a date (2026-10-01), an ISO');
  console.log('                       time, or an age such as 30m, 12h, 7d, 2w');
  console.log(`  --limit N            Show the last N exports (default: ${DEFAULT_TABLE_LIMIT};`);
  console.log('                       with --json: all; 0 = all)');
  console.log('  --json               Print the events as a JSON array');
  console.log("  --file PATH          Read this log instead of the policy's audit log(s)");
  console.log('  -h, --help           Show this help\n');
  console.log(`The log is written while ${POLICY_FILE} (or $CTXMAN_POLICY) enables audit;`);
  console.log(`default location: ${DEFAULT_AUDIT_PATH}. One JSON object per line; each export`);
  console.log('records who, when, where to, which files and a SHA-256 of the exported text.');
}

main();
