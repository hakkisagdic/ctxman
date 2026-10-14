#!/usr/bin/env node
/**
 * Policy Command
 * Validate and show the export policy (`ctxman policy check`), or write a starter policy
 * (`ctxman policy init`)
 */

import fs from 'fs';
import path from 'path';
import {
  loadPolicy,
  createStarterPolicy,
  loadIgnoreFileRules,
  POLICY_FILE,
  POLICY_ENV,
  POLICY_DOCS_URL,
  PolicyConfigError,
} from '../lib/policy/index.js';

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'check';

  switch (command) {
    case 'check':
      check(args.includes('--json'));
      break;
    case 'init':
      init(args.includes('--force') || args.includes('-f'));
      break;
    default:
      console.error(`❌ Unknown policy command: ${command}`);
      console.error('   Usage: ctxman policy <check|init> (see ctxman policy --help)');
      process.exitCode = 2;
  }
}

function check(json) {
  const root = process.cwd();
  let policy;
  try {
    policy = loadPolicy(root);
  } catch (error) {
    if (!(error instanceof PolicyConfigError)) throw error;
    if (json) {
      console.log(
        JSON.stringify({ valid: false, file: error.file, errors: error.errors }, null, 2)
      );
    } else {
      console.error(`❌ ${error.message}`);
    }
    process.exitCode = error.exitCode;
    return;
  }

  if (json) {
    console.log(JSON.stringify({ valid: true, ...policy.toJSON() }, null, 2));
    return;
  }

  if (!policy.active) {
    console.log(`No export policy: there is no ${POLICY_FILE} and ${POLICY_ENV} is not set.`);
    console.log('Exports are unrestricted. Create a policy with: ctxman policy init');
    return;
  }

  const display = (file) => (file.startsWith(root + path.sep) ? path.relative(root, file) : file);
  const label = (text) => `${text}:`.padEnd(24);

  console.log('🛡️  ctxman export policy');
  console.log(`Project root: ${root}`);
  console.log();
  console.log('Policy files:');
  for (const { scope, file } of policy.sources) {
    console.log(`  ${scope.padEnd(13)} ${display(file)}`);
  }
  console.log();

  console.log('Deny rules (never exported):');
  if (policy.denyRules.length === 0) console.log('  (none)');
  for (const rule of policy.denyRules) {
    console.log(`  [${rule.scope}] ${rule.patterns.join('  ')}`);
  }
  console.log(
    label('Require redaction') + (policy.requireRedaction ? 'yes (--no-redact is refused)' : 'no')
  );
  console.log(
    label('Max export tokens') +
      (policy.maxExportTokens === null
        ? 'no limit'
        : policy.maxExportTokens.toLocaleString('en-US'))
  );
  console.log(
    label('Allowed target models') +
      (policy.modelRules.length === 0
        ? 'any'
        : policy.modelRules
            .map((rule) => `${rule.patterns.join(', ')} [${rule.scope}]`)
            .join(' AND '))
  );

  if (policy.ignoreFiles.length === 0) {
    console.log(label('AI-tool ignore files') + 'none');
  } else {
    console.log(
      label('AI-tool ignore files') + loadIgnoreFileRules(root, policy.ignoreFiles).describe()
    );
  }

  console.log(
    label('Audit log') + (policy.audit.enabled ? policy.audit.paths.map(display).join(', ') : 'off')
  );
  console.log();
  console.log('✅ Policy is valid.');
}

function init(force) {
  const file = path.join(process.cwd(), POLICY_FILE);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    // 'wx' fails when the file exists, without a separate check that could go stale
    fs.writeFileSync(file, `${JSON.stringify(createStarterPolicy(), null, 2)}\n`, {
      flag: force ? 'w' : 'wx',
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.error(`❌ ${POLICY_FILE} already exists. Use --force to overwrite it.`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Wrote ${POLICY_FILE}`);
  console.log();
  console.log('JSON has no comments, so the "$comment" field points to the reference:');
  console.log(`   ${POLICY_DOCS_URL}`);
  console.log();
  console.log('Next steps:');
  console.log('  1. Edit the "deny" list (.gitignore syntax) and the limits.');
  console.log('  2. Run `ctxman policy check` to validate it.');
  console.log('  3. Add .ctxman/audit.log to .gitignore; commit .ctxman/policy.json.');
  console.log(`  Organisation-wide rules: point ${POLICY_ENV} at a shared policy file.`);
}

function printHelp() {
  console.log('ctxman policy - export policy for this repository\n');
  console.log('Usage: ctxman policy [check|init] [options]\n');
  console.log('Commands:');
  console.log('  check                Validate the policy files and print the effective policy');
  console.log('                       (default)');
  console.log(`  init                 Write a starter ${POLICY_FILE}\n`);
  console.log('Options:');
  console.log('  --json               check: print the effective policy as JSON');
  console.log('  -f, --force          init: overwrite an existing policy file');
  console.log('  -h, --help           Show this help\n');
  console.log('Policy files:');
  console.log(`  ${POLICY_FILE}  Project policy, committed with the repository`);
  console.log(`  $${POLICY_ENV}        Organisation policy file; wins on conflicts (deny lists`);
  console.log('                       are combined, the stricter limit applies)\n');
  console.log('Exit codes: 0 valid or no policy, 2 invalid policy file');
  console.log(`Reference: ${POLICY_DOCS_URL}`);
}

main();
