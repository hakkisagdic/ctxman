import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CLI_PATH = path.join(process.cwd(), 'ctxman.js');
const TEMP_DIR = path.join(process.cwd(), 'test/temp-gitingest-json');

function runCommand(args) {
  try {
    const command = `node ${CLI_PATH} ${args}`;
    const output = execSync(command, {
      encoding: 'utf8',
      cwd: TEMP_DIR,
      stdio: 'pipe',
      timeout: 10000, // 10s timeout should be enough for small dir
    });
    return { success: true, output, error: null };
  } catch (error) {
    console.error('Command failed:', error.message);
    console.error('Output:', error.stdout);
    return { success: false, output: error.stdout || '', error: error.message };
  }
}

describe('GitIngest JSON Integration', () => {
  beforeAll(() => {
    // Create temp directory and files
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    fs.writeFileSync(path.join(TEMP_DIR, 'file1.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(TEMP_DIR, 'file2.md'), '# Title\nContent');
    fs.writeFileSync(path.join(TEMP_DIR, 'package.json'), '{}');
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  test('generates token-analysis-report.json', () => {
    const result = runCommand('--save-report');
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, 'token-analysis-report.json'))).toBe(true);
  });

  test('generates digest from report', () => {
    const result = runCommand('--gitingest-from-report token-analysis-report.json');
    expect(result.success).toBe(true);
    expect(result.output).toContain('GitIngest digest saved');

    const digestPath = path.join(TEMP_DIR, 'digest.txt');
    expect(fs.existsSync(digestPath)).toBe(true);

    const content = fs.readFileSync(digestPath, 'utf8');
    expect(content).toContain('Directory structure:');
    expect(content).toContain('FILE:');
  });

  test('generates llm-context.json', () => {
    const result = runCommand('--context-export');
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, 'llm-context.json'))).toBe(true);
  });

  test('generates digest from context', () => {
    // Remove previous digest
    const digestPath = path.join(TEMP_DIR, 'digest.txt');
    if (fs.existsSync(digestPath)) fs.unlinkSync(digestPath);

    const result = runCommand('--gitingest-from-context llm-context.json');
    expect(result.success).toBe(true);
    expect(result.output).toContain('GitIngest digest saved');
    expect(fs.existsSync(digestPath)).toBe(true);
  });

  test('uses default filename for report', () => {
    const digestPath = path.join(TEMP_DIR, 'digest.txt');
    if (fs.existsSync(digestPath)) fs.unlinkSync(digestPath);

    const result = runCommand('--gitingest-from-report');
    expect(result.success).toBe(true);
    expect(fs.existsSync(digestPath)).toBe(true);
  });

  test('uses default filename for context', () => {
    const digestPath = path.join(TEMP_DIR, 'digest.txt');
    if (fs.existsSync(digestPath)) fs.unlinkSync(digestPath);

    const result = runCommand('--gitingest-from-context');
    expect(result.success).toBe(true);
    expect(fs.existsSync(digestPath)).toBe(true);
  });

  test('handles missing file error', () => {
    const result = runCommand('--gitingest-from-report nonexistent.json');
    expect(result.success).toBe(false);
  });
});
