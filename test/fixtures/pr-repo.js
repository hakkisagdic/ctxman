/**
 * Temporary git repository for the `ctxman pr` tests: a `main` branch and a `feature`
 * branch that adds, modifies, deletes and renames files, changes a JavaScript, a Python
 * and a Go function, deletes a method and commits a fake AWS key
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const FAKE_AWS_KEY = 'AKIAABCDEFGHIJKLMNOP';

const BASE_FILES = {
  'src/calc.js': `export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

export function legacyMultiply(a, b) {
  let result = 0;
  for (let i = 0; i < b; i++) result += a;
  return result;
}
`,
  'src/calc.test.js': `import { add, subtract } from './calc.js';

test('add', () => expect(add(1, 2)).toBe(3));
test('subtract', () => expect(subtract(3, 2)).toBe(1));
`,
  'src/format.js': `export function formatLabel(label) {
  const text = String(label);
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  return upper;
}

export function padLabel(label, width) {
  return String(label).padEnd(width);
}
`,
  'lib/store.py': `def greet(name):
    return "hello " + name


class Store:
    def __init__(self):
        self.items = {}

    def get_item(self, key):
        return self.items[key]

    def put_item(self, key, value):
        self.items[key] = value
`,
  'tests/test_store.py': `from lib.store import greet


def test_greet():
    assert greet("a") == "hello a"
`,
  'server/server.go': `package server

import "fmt"

func HandleRequest(path string) string {
	return fmt.Sprintf("path=%s", path)
}

func Version() string {
	return "1"
}
`,
  'server/server_test.go': `package server

import "testing"

func TestVersion(t *testing.T) {
	if Version() != "1" {
		t.Fatal("version")
	}
}
`,
  'docs/guide.md': '# Guide\n\nLine one.\nLine two.\nLine three.\nLine four.\n',
  'obsolete.txt': 'old\n',
};

const FEATURE_COMMIT_1 = {
  'src/calc.js': `export function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('add expects numbers');
  }
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}
`,
  'lib/store.py': `def greet(name):
    return "hello, " + name.strip()


class Store:
    def __init__(self):
        self.items = {}

    def get_item(self, key):
        return self.items[key]

    def put_item(self, key, value):
        self.items[key] = value
`,
  'src/config.js': `export const awsKey = '${FAKE_AWS_KEY}';\n`,
};

const FEATURE_COMMIT_2 = {
  'server/server.go': `package server

import "fmt"

func HandleRequest(path string) string {
	if path == "" {
		path = "/"
	}
	return fmt.Sprintf("path=%s", path)
}

func Version() string {
	return "1"
}
`,
};

/**
 * Create the repository; the caller removes `dir` when done
 * @returns {{dir: string, git: (...args: string[]) => string, write: Function}}
 */
export function createPrRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-pr-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=Test Author', '-c', 'user.email=t@t', ...args], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const write = (files) => {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  };

  git('init', '-q');
  git('config', 'commit.gpgsign', 'false');
  git('checkout', '-q', '-b', 'main');
  write(BASE_FILES);
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');

  git('checkout', '-q', '-b', 'feature');
  write(FEATURE_COMMIT_1);
  git('rm', '-q', 'obsolete.txt');
  git('mv', 'docs/guide.md', 'docs/handbook.md');
  git('add', '-A');
  git(
    'commit',
    '-q',
    '-m',
    'feat: validate add input',
    '-m',
    'Callers passed strings and got concatenation.'
  );

  write(FEATURE_COMMIT_2);
  git('mv', 'src/format.js', 'src/label.js');
  const label = path.join(dir, 'src/label.js');
  fs.writeFileSync(
    label,
    fs.readFileSync(label, 'utf8').replace('  return upper;', '  return `[${upper}]`;')
  );
  git('add', '-A');
  git('commit', '-q', '-m', 'feat: default request path');

  return { dir, git, write };
}
