#!/usr/bin/env node
/**
 * Audit Command
 * Print the export audit log written while a policy enables `audit`
 */

import path from 'path';
import {
  loadPolicy,
  readAuditLog,
  filterAuditEvents,
  formatAuditTable,
  parseSince,
  DEFAULT_AUDIT_PATH,
  POLICY_FILE,
} from '../lib/policy/index.js';

const DEFAULT_TABLE_LIMIT = 50;

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
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 2;
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

// The policy's audit logs; the default location when no policy names one
function auditFiles() {
  const root = process.cwd();
  try {
    const policy = loadPolicy(root);
    if (policy.audit.paths.length > 0) return policy.audit.paths;
  } catch (error) {
    console.error(`⚠️  ${error.message}`);
    console.error(`   Reading the default log ${DEFAULT_AUDIT_PATH} instead.`);
  }
  return [path.join(root, DEFAULT_AUDIT_PATH)];
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
