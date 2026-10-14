import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildRepoGraph, signatureAt } from '../lib/map/index.js';
import { ImportTracker } from '../lib/analyzers/import-tracker.js';
import { stripJsonComments } from '../lib/map/resolver.js';

describe('repository graph', () => {
  let root;

  const write = (files) => {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  };
  const graphOf = (files, options = {}) => {
    write(files);
    return buildRepoGraph(root, { history: 0, ...options });
  };
  /** Edges as "from -> to" (weight appended when it is not 1) */
  const edgesOf = (graph) =>
    graph.edges.map(
      ({ from, to, weight }) => `${from} -> ${to}${weight === 1 ? '' : ` ${weight.toFixed(2)}`}`
    );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxman-map-graph-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('JavaScript and TypeScript', () => {
    it('resolves ESM and CommonJS paths with extensions, index files and re-exports', () => {
      const graph = graphOf({
        'src/app.js': [
          "import { a } from './lib/a.js';",
          "import b from './lib/b';",
          "import * as util from './util';",
          "import './polyfill.js';",
          "const c = require('./lib/c');",
          "const { d } = require('../shared/d.js');",
          "import express from 'express';",
          "import fs from 'node:fs';",
          'export function main() {',
          '  return a + b + c + d + util;',
          '}',
        ].join('\n'),
        'src/lib/a.js': 'export const a = 1;\n',
        'src/lib/b.js': 'export default 2;\n',
        'src/lib/c.js': 'module.exports = 3;\n',
        'src/util/index.js': "export * from './format.js';\nexport { x as y } from './parse';\n",
        'src/util/format.js': 'export const format = 1;\n',
        'src/util/parse.js': 'export const x = 1;\n',
        'src/polyfill.js': 'globalThis.p = 1;\n',
        'shared/d.js': 'exports.d = 4;\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/app.js -> shared/d.js',
        'src/app.js -> src/lib/a.js',
        'src/app.js -> src/lib/b.js',
        'src/app.js -> src/lib/c.js',
        'src/app.js -> src/polyfill.js',
        'src/app.js -> src/util/index.js',
        'src/util/index.js -> src/util/format.js',
        'src/util/index.js -> src/util/parse.js',
      ]);
      // express and node:fs are packages, not files of the project
      expect(graph.nodes.find((node) => node.path === 'src/app.js').unresolvedImports).toBe(2);
    });

    it('maps ESM `.js` specifiers to TypeScript sources and applies tsconfig paths', () => {
      const graph = graphOf({
        'tsconfig.json': [
          '{',
          '  // comments and trailing commas are allowed here',
          '  "compilerOptions": {',
          '    "baseUrl": ".",',
          '    "paths": { "@/*": ["src/*"], "#config": ["config/index.ts"], },',
          '  },',
          '}',
        ].join('\n'),
        'src/main.ts': [
          "import { helper } from './helper.js';",
          "import type { Options } from './types';",
          "import { Button } from '@/ui/button';",
          "import config from '#config';",
          'export const run = () => helper(config, Button);',
        ].join('\n'),
        'src/helper.ts': 'export function helper() {}\n',
        'src/types.ts': 'export interface Options {}\n',
        'src/ui/button.tsx': 'export const Button = 1;\n',
        'config/index.ts': 'export default {};\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/main.ts -> config/index.ts',
        'src/main.ts -> src/helper.ts',
        'src/main.ts -> src/types.ts',
        'src/main.ts -> src/ui/button.tsx',
      ]);
    });

    it('keeps relative imports inside the project', () => {
      const graph = graphOf({ 'a.js': "import x from '../../outside.js';\n" });

      expect(graph.edges).toEqual([]);
      expect(graph.nodes[0].unresolvedImports).toBe(1);
    });
  });

  describe('Python', () => {
    it('resolves relative and absolute imports within the repository', () => {
      const graph = graphOf({
        'app/__init__.py': '',
        'app/main.py': [
          'import os',
          'import app.models',
          'from app.services import billing, mail',
          'from . import utils',
          'from .config import settings',
          'from .. import toplevel',
          'from app.models.user import (',
          '    User,',
          '    Admin,',
          ')',
          '',
          'def run():',
          '    pass',
        ].join('\n'),
        'app/models/__init__.py': '',
        'app/models/user.py': 'class User:\n    pass\n',
        'app/services/__init__.py': '',
        'app/services/billing.py': 'def charge():\n    pass\n',
        'app/services/mail.py': 'def send():\n    pass\n',
        'app/utils.py': 'def helper():\n    pass\n',
        'app/config.py': 'settings = {}\n',
        'toplevel.py': 'X = 1\n',
      });

      expect(edgesOf(graph)).toEqual([
        'app/main.py -> app/config.py',
        'app/main.py -> app/models/__init__.py',
        'app/main.py -> app/models/user.py',
        'app/main.py -> app/services/__init__.py',
        'app/main.py -> app/services/billing.py',
        'app/main.py -> app/services/mail.py',
        'app/main.py -> app/utils.py',
        'app/main.py -> toplevel.py',
      ]);
    });

    it('finds packages under src/ and next to the importing script', () => {
      const graph = graphOf({
        'src/pkg/__init__.py': 'from pkg.core import run\n',
        'src/pkg/core.py': 'def run():\n    pass\n',
        'scripts/tool.py': 'import helpers\nimport pkg.core\n',
        'scripts/helpers.py': 'def h():\n    pass\n',
      });

      expect(edgesOf(graph)).toEqual([
        'scripts/tool.py -> scripts/helpers.py',
        'scripts/tool.py -> src/pkg/core.py',
        'src/pkg/__init__.py -> src/pkg/core.py',
      ]);
    });
  });

  describe('Go', () => {
    it('links a package import to the non-test files of the package in the module', () => {
      const graph = graphOf({
        'go.mod': 'module example.com/shop\n\ngo 1.22\n',
        'cmd/server/main.go': [
          'package main',
          '',
          'import (',
          '\t"fmt"',
          '\t"example.com/shop/internal/store"',
          '\tapi "example.com/shop/pkg/api"',
          ')',
          '',
          'func main() {',
          '\tfmt.Println(store.New(), api.Version)',
          '}',
        ].join('\n'),
        'internal/store/store.go':
          'package store\n\nimport "example.com/shop/pkg/api"\n\nfunc New() int { return api.Version }\n',
        'internal/store/cache.go': 'package store\n\nfunc cache() {}\n',
        'internal/store/store_test.go': 'package store\n\nfunc TestNew(t *testing.T) {}\n',
        'pkg/api/api.go': 'package api\n\nconst Version = 1\n',
      });

      expect(edgesOf(graph)).toEqual([
        'cmd/server/main.go -> internal/store/cache.go 0.50',
        'cmd/server/main.go -> internal/store/store.go 0.50',
        'cmd/server/main.go -> pkg/api/api.go',
        'internal/store/store.go -> pkg/api/api.go',
      ]);
    });
  });

  describe('Java, Kotlin and C#', () => {
    it('resolves Java and Kotlin imports through declared packages', () => {
      const graph = graphOf({
        'src/main/java/com/acme/App.java': [
          'package com.acme;',
          '',
          'import com.acme.model.User;',
          'import com.acme.util.*;',
          'import static com.acme.model.Role.ADMIN;',
          'import java.util.List;',
          '',
          'public class App {}',
        ].join('\n'),
        'src/main/java/com/acme/model/User.java': 'package com.acme.model;\npublic class User {}\n',
        'src/main/java/com/acme/model/Role.java': 'package com.acme.model;\npublic enum Role {}\n',
        'src/main/java/com/acme/util/Strings.java': 'package com.acme.util;\nclass Strings {}\n',
        'src/main/java/com/acme/util/Dates.java': 'package com.acme.util;\nclass Dates {}\n',
        'src/main/kotlin/com/acme/Report.kt': [
          'package com.acme.report',
          '',
          'import com.acme.model.User',
          'import com.acme.ext.formatName as fmt',
          '',
          'fun report(user: User) = fmt(user)',
        ].join('\n'),
        'src/main/kotlin/com/acme/Extensions.kt':
          'package com.acme.ext\n\nfun formatName(user: Any): String {\n  return ""\n}\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/main/java/com/acme/App.java -> src/main/java/com/acme/model/Role.java',
        'src/main/java/com/acme/App.java -> src/main/java/com/acme/model/User.java',
        'src/main/java/com/acme/App.java -> src/main/java/com/acme/util/Dates.java 0.50',
        'src/main/java/com/acme/App.java -> src/main/java/com/acme/util/Strings.java 0.50',
        'src/main/kotlin/com/acme/Report.kt -> src/main/java/com/acme/model/User.java',
        'src/main/kotlin/com/acme/Report.kt -> src/main/kotlin/com/acme/Extensions.kt',
      ]);
    });

    it('resolves C# using directives through declared namespaces', () => {
      const graph = graphOf({
        'App/Program.cs':
          'using System;\nusing Acme.Data;\n\nnamespace Acme.App;\nclass Program {}\n',
        'Data/Repo.cs': 'namespace Acme.Data\n{\n  public class Repo {}\n}\n',
      });

      expect(edgesOf(graph)).toEqual(['App/Program.cs -> Data/Repo.cs']);
    });
  });

  describe('Ruby, PHP, C/C++ and Rust', () => {
    it('resolves require_relative and require from lib/', () => {
      const graph = graphOf({
        'lib/shop.rb': "require 'json'\nrequire_relative 'shop/cart'\n",
        'lib/shop/cart.rb': "require_relative '../shop/item.rb'\n",
        'lib/shop/item.rb': 'class Item; end\n',
        'bin/run.rb': "require 'shop'\n",
      });

      expect(edgesOf(graph)).toEqual([
        'bin/run.rb -> lib/shop.rb',
        'lib/shop.rb -> lib/shop/cart.rb',
        'lib/shop/cart.rb -> lib/shop/item.rb',
      ]);
    });

    it('resolves PHP use statements by namespace and require paths', () => {
      const graph = graphOf({
        'src/Http/Controller.php': [
          '<?php',
          'namespace App\\Http;',
          '',
          'use App\\Models\\{User, Post};',
          'use App\\Support\\Str as S;',
          'use Illuminate\\Support\\Facades\\DB;',
          "require_once __DIR__ . '/../helpers.php';",
          '',
          'class Controller {',
          '    use Authorizes;',
          '}',
        ].join('\n'),
        'src/Http/Authorizes.php': '<?php\nnamespace App\\Http;\ntrait Authorizes {}\n',
        'src/Models/User.php': '<?php\nnamespace App\\Models;\nclass User {}\n',
        'src/Models/Post.php': '<?php\nnamespace App\\Models;\nclass Post {}\n',
        'src/Support/Str.php': '<?php\nnamespace App\\Support;\nclass Str {}\n',
        'src/helpers.php': '<?php\nfunction helper() {}\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/Http/Controller.php -> src/Http/Authorizes.php',
        'src/Http/Controller.php -> src/Models/Post.php',
        'src/Http/Controller.php -> src/Models/User.php',
        'src/Http/Controller.php -> src/Support/Str.php',
        'src/Http/Controller.php -> src/helpers.php',
      ]);
    });

    it('resolves local #include "..." headers and ignores system headers', () => {
      const graph = graphOf({
        'src/main.c': '#include <stdio.h>\n#include "util.h"\n#include "net/socket.h"\n',
        'src/util.h': 'int util(void);\n',
        'include/net/socket.h': 'int sock(void);\n',
        'src/net/impl.cpp': '#include "../util.h"\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/main.c -> include/net/socket.h',
        'src/main.c -> src/util.h',
        'src/net/impl.cpp -> src/util.h',
      ]);
    });

    it('resolves Rust mod declarations and crate/super/self paths', () => {
      const graph = graphOf({
        'Cargo.toml': '[package]\nname = "shop"\nversion = "0.1.0"\n',
        'src/main.rs': 'mod db;\nmod api;\nuse crate::db::pool::Pool;\n\nfn main() {}\n',
        'src/db/mod.rs': 'pub mod pool;\n',
        'src/db/pool.rs': 'use super::super::api::{handlers, Router};\npub struct Pool;\n',
        'src/api.rs': 'pub mod handlers;\nuse self::handlers::index;\n',
        'src/api/handlers.rs': 'pub fn index() {}\n',
      });

      expect(edgesOf(graph)).toEqual([
        'src/api.rs -> src/api/handlers.rs',
        'src/db/mod.rs -> src/db/pool.rs',
        'src/db/pool.rs -> src/api.rs',
        'src/db/pool.rs -> src/api/handlers.rs',
        'src/main.rs -> src/api.rs',
        'src/main.rs -> src/db/mod.rs',
        'src/main.rs -> src/db/pool.rs',
      ]);
    });
  });

  describe('nodes', () => {
    it('respects .gitignore and .contextignore, and leaves out minified files', () => {
      const graph = graphOf({
        '.gitignore': 'generated/\n',
        '.contextignore': 'vendor/**\n',
        'src/a.js': "import './b.js';\nexport function a() {\n  return 1;\n}\n",
        'src/b.js': 'export const b = 1;\n',
        'generated/out.js': 'export const g = 1;\n',
        'vendor/lib.js': 'export const v = 1;\n',
        'src/bundle.js': `${'var a=1;'.repeat(1000)}\n`,
        'README.md': '# readme\n',
      });

      expect(graph.nodes.map((node) => node.path)).toEqual(['src/a.js', 'src/b.js']);
      expect(graph.stats.skipped).toEqual([{ path: 'src/bundle.js', reason: 'minified' }]);
    });

    it('lists functions with one-line signatures and redacts secrets in them', () => {
      const token = `ghp_${'a'.repeat(36)}`;
      const graph = graphOf({
        'src/api.js': [
          'export function connect(',
          '  host,',
          '  port = 443',
          ') {',
          '  return host;',
          '}',
          `function login(token = '${token}') { return token; }`,
        ].join('\n'),
      });

      const methods = graph.nodes[0].methods;
      expect(methods.map((m) => [m.line, m.name, m.signature])).toEqual([
        [1, 'connect', 'export function connect(host, port = 443)'],
        [7, 'login', "function login(token = '[REDACTED:github-token]')"],
      ]);
      expect(graph.stats.redactions).toEqual({ 'github-token': 1 });

      const raw = buildRepoGraph(root, { history: 0, redact: false });
      expect(raw.nodes[0].methods[1].signature).toContain(token);
    });

    it('counts mentions of a file’s function names in other files', () => {
      const graph = graphOf({
        'lib/format.js': 'export function formatPrice(x) {\n  return x;\n}\n',
        'lib/unused.js': 'export function neverCalled() {\n  return 1;\n}\n',
        'a.js': 'formatPrice(1);\n',
        'b.js': 'formatPrice(2);\n',
      });
      const refs = Object.fromEntries(graph.nodes.map((node) => [node.path, node.symbolRefs]));

      expect(refs['lib/format.js']).toBe(2);
      expect(refs['lib/unused.js']).toBe(0);
    });

    it('rejects a root that is not a directory and an invalid history', () => {
      write({ 'file.js': '' });

      expect(() => buildRepoGraph(path.join(root, 'file.js'))).toThrow('Not a directory');
      expect(() => buildRepoGraph(root, { history: -1 })).toThrow('history');
    });
  });
});

describe('map helpers', () => {
  it('ImportTracker.parseModuleSpecifiers finds every specifier form once', () => {
    const tracker = new ImportTracker('.');
    const content = [
      "import a from './a.js';",
      "import b, * as ns from './b.js';",
      "import type { T } from './types';",
      "export * from './c.js';",
      "export { d } from './d.js';",
      "import './side-effect.js';",
      "const e = require('./e');",
      "const lazy = import('./lazy.js');",
      "import again from './a.js';",
    ].join('\n');

    expect(tracker.parseModuleSpecifiers(content).sort()).toEqual(
      [
        './a.js',
        './b.js',
        './types',
        './c.js',
        './d.js',
        './side-effect.js',
        './e',
        './lazy.js',
      ].sort()
    );
  });

  it('signatureAt cuts one-line bodies and long declarations', () => {
    expect(signatureAt(['  save(item) { return item; }'], 1)).toBe('save(item)');
    expect(signatureAt(['func (s *Store) Get(id int) (Item, error) {'], 1)).toBe(
      'func (s *Store) Get(id int) (Item, error)'
    );
    expect(signatureAt(['def run(self, x):'], 1)).toBe('def run(self, x):');
    expect(signatureAt([`function f(${'a, '.repeat(60)}b) {`], 1)).toHaveLength(120);
  });

  it('stripJsonComments keeps comment-like text inside strings', () => {
    const text = '{\n  // note\n  "paths": { "@/*": ["src/*"] }, /* block */\n}';

    expect(JSON.parse(stripJsonComments(text))).toEqual({ paths: { '@/*': ['src/*'] } });
  });
});
