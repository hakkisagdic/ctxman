import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

/** Run a command, close its stdout after the first chunk, and collect the exit */
function runAndCloseEarly(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: process.cwd() });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.once('data', () => child.stdout.destroy());
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

describe('output to a closed pipe (ctxman ... | head)', () => {
  test.each([
    [['--verbose', '--simple']],
    [['count', 'lib', '--top', '400']],
    [['search', 'token', 'lib', '--limit', '50', '--full']],
  ])('%j stops quietly', async (args) => {
    const { code, stderr } = await runAndCloseEarly(args);
    expect(stderr).not.toContain('EPIPE');
    expect(code).toBe(0);
  });
});
