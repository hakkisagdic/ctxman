/**
 * Import resolution for the repository map
 *
 * Turns the raw references from imports.js into files of the repository. Only files the
 * scanner returned can be targets, so anything outside the project (packages, the
 * standard library, ignored files) stays unresolved and is ignored. All paths are
 * project-relative with forward slashes.
 */

import fs from 'fs';
import path from 'path';

const posix = path.posix;

// TypeScript sources first: they win over compiled JavaScript next to them
const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.d.ts'];
// An ESM import names the compiled file (`./a.js`) even when the source is `a.ts`
const JS_TO_TS = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };
const RUST_ROOT_DIRS = new Set(['bin', 'examples', 'tests', 'benches']);

/** Directory of a project-relative path ('' for the root) */
function dirOf(filePath) {
  const dir = posix.dirname(filePath);
  return dir === '.' ? '' : dir;
}

/** Join and normalise; null when the result leaves the project */
function joinInside(...parts) {
  const joined = posix.normalize(posix.join(...parts.filter((part) => part !== '')));
  if (joined === '..' || joined.startsWith('../') || posix.isAbsolute(joined)) return null;
  return joined === '.' ? '' : joined;
}

/** Number of leading directory names two paths share */
function sharedDepth(a, b) {
  const left = dirOf(a).split('/');
  const right = dirOf(b).split('/');
  let depth = 0;
  while (depth < left.length && depth < right.length && left[depth] === right[depth]) depth++;
  return depth;
}

/**
 * Remove comments and trailing commas from JSON with comments (tsconfig.json)
 * @param {string} text
 * @returns {string}
 */
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += ch;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export class ImportResolver {
  /**
   * @param {string} root - Absolute project root
   * @param {Array<{path: string, language: string, declarations: string[],
   *   methods: Array<{name: string}>}>} nodes - Files of the map
   */
  constructor(root, nodes) {
    this.root = root;
    this.nodes = new Map(nodes.map((node) => [node.path, node]));
    this.dirFiles = new Map();
    this.byBasename = new Map();
    this.typeIndex = new Map(); // fully qualified type name -> file (Java, Kotlin, Scala, C#)
    this.packageIndex = new Map(); // package or namespace -> files
    this.phpIndex = new Map(); // lower-case PHP class name -> file
    this.phpNamespaces = new Map(); // lower-case PHP namespace -> files
    this.existsCache = new Map();
    this.goModules = null;
    this.cargoCache = new Map();
    this.cratesByName = null;
    this.jsAliases = undefined;

    for (const node of nodes) {
      const dir = dirOf(node.path);
      if (!this.dirFiles.has(dir)) this.dirFiles.set(dir, []);
      this.dirFiles.get(dir).push(node.path);
      const base = posix.basename(node.path);
      if (!this.byBasename.has(base)) this.byBasename.set(base, []);
      this.byBasename.get(base).push(node.path);

      const typeName = posix.basename(node.path).replace(/\.[^.]+$/, '');
      for (const declared of node.declarations || []) {
        if (node.language === 'php') {
          addTo(this.phpNamespaces, declared.toLowerCase(), node.path);
        } else {
          addTo(this.packageIndex, declared, node.path);
          if (!this.typeIndex.has(`${declared}.${typeName}`)) {
            this.typeIndex.set(`${declared}.${typeName}`, node.path);
          }
        }
      }
      if (node.language === 'php') {
        const namespace = node.declarations?.[0];
        const name = (namespace ? `${namespace}\\${typeName}` : typeName).toLowerCase();
        if (!this.phpIndex.has(name)) this.phpIndex.set(name, node.path);
      }
    }
  }

  /**
   * Files a node depends on
   * @param {Object} node - Node with `path`, `language` and `imports` (from imports.js)
   * @returns {{edges: Array<{to: string, weight: number}>, unresolved: number}}
   */
  resolve(node) {
    const edges = new Map();
    let unresolved = 0;
    for (const ref of node.imports || []) {
      const targets = this.resolveOne(node, ref).filter((target) => target.to !== node.path);
      if (targets.length === 0) unresolved++;
      for (const { to, weight } of targets) {
        edges.set(to, Math.max(edges.get(to) || 0, weight));
      }
    }
    return {
      edges: [...edges].map(([to, weight]) => ({ to, weight })),
      unresolved,
    };
  }

  /** @returns {Array<{to: string, weight: number}>} */
  resolveOne(node, ref) {
    switch (node.language) {
      case 'javascript':
      case 'typescript':
        return single(this.resolveJs(node.path, ref.spec));
      case 'python':
        return this.resolvePython(node.path, ref).map((to) => ({ to, weight: 1 }));
      case 'go':
        return spread(this.resolveGo(node.path, ref.spec));
      case 'java':
      case 'kotlin':
      case 'scala':
        return this.resolveJvm(ref);
      case 'ruby':
        return single(this.resolveRuby(node.path, ref));
      case 'php':
        return this.resolvePhp(node, ref);
      case 'c':
      case 'cpp':
        return single(this.resolveInclude(node.path, ref.include));
      case 'rust':
        return single(this.resolveRust(node.path, ref));
      case 'csharp':
        return this.resolveCSharp(ref);
      default:
        return [];
    }
  }

  has(filePath) {
    return filePath !== null && this.nodes.has(filePath);
  }

  firstExisting(candidates) {
    return candidates.find((candidate) => this.has(candidate)) ?? null;
  }

  existsOnDisk(relativePath) {
    if (!this.existsCache.has(relativePath)) {
      this.existsCache.set(relativePath, fs.existsSync(path.join(this.root, relativePath)));
    }
    return this.existsCache.get(relativePath);
  }

  readText(relativePath) {
    try {
      return fs.readFileSync(path.join(this.root, relativePath), 'utf-8');
    } catch (_error) {
      return null;
    }
  }

  // ---------------------------------------------------------------- JavaScript/TypeScript

  resolveJs(fromPath, rawSpec) {
    // `./worker.js?url` (bundler query), but `#internal` (subpath import) stays whole
    const cut = rawSpec.slice(1).search(/[?#]/);
    const spec = cut === -1 ? rawSpec : rawSpec.slice(0, cut + 1);
    let bases;
    if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
      bases = [joinInside(dirOf(fromPath), spec)];
    } else {
      bases = this.aliasTargets(spec);
    }
    for (const base of bases) {
      if (base === null) continue;
      const hit = this.firstExisting(this.jsCandidates(base));
      if (hit) return hit;
    }
    return null;
  }

  jsCandidates(base) {
    const candidates = [base];
    const ext = posix.extname(base);
    for (const tsExt of JS_TO_TS[ext] || []) candidates.push(base.slice(0, -ext.length) + tsExt);
    for (const extension of JS_EXTENSIONS) candidates.push(base + extension);
    const index = base === '' ? 'index' : `${base}/index`;
    for (const extension of JS_EXTENSIONS) candidates.push(index + extension);
    return candidates;
  }

  /** Targets of a bare specifier under the `paths`/`baseUrl` of tsconfig.json/jsconfig.json */
  aliasTargets(spec) {
    if (this.jsAliases === undefined) this.jsAliases = this.loadJsAliases();
    if (!this.jsAliases) return [];
    const { baseUrl, paths, explicitBaseUrl } = this.jsAliases;
    const targets = [];
    for (const [pattern, replacements] of paths) {
      const star = pattern.indexOf('*');
      let captured = null;
      if (star === -1) {
        if (spec === pattern) captured = '';
      } else {
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (
          spec.startsWith(prefix) &&
          spec.endsWith(suffix) &&
          spec.length >= prefix.length + suffix.length
        ) {
          captured = spec.slice(prefix.length, spec.length - suffix.length);
        }
      }
      if (captured === null) continue;
      for (const replacement of replacements) {
        targets.push(joinInside(baseUrl, String(replacement).split('*').join(captured)));
      }
    }
    if (explicitBaseUrl) targets.push(joinInside(baseUrl, spec));
    return targets;
  }

  loadJsAliases() {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const text = this.readText(name);
      if (text === null) continue;
      try {
        const options = JSON.parse(stripJsonComments(text)).compilerOptions || {};
        const baseUrl = joinInside(options.baseUrl || '.');
        if (baseUrl === null) return null;
        const paths = Object.entries(options.paths || {}).filter(([, value]) =>
          Array.isArray(value)
        );
        return { baseUrl, paths, explicitBaseUrl: Boolean(options.baseUrl) };
      } catch (_error) {
        return null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------- Python

  resolvePython(fromPath, ref) {
    const names = ref.names.filter((name) => name !== '*');
    const dots = ref.module.match(/^\.*/)[0].length;
    const dotted = ref.module.slice(dots);

    if (dots > 0) {
      let base = dirOf(fromPath);
      for (let level = 1; level < dots; level++) {
        if (base === '') return [];
        base = dirOf(base);
      }
      return this.pythonTargets([base], dotted, names);
    }
    return this.pythonTargets(this.pythonRoots(fromPath), dotted, names);
  }

  /** Module (and imported submodules) under the first source root that has it */
  pythonTargets(roots, dotted, names) {
    for (const root of roots) {
      const found = [];
      const module = dotted ? this.pythonModule(root, dotted) : null;
      if (module) found.push(module);
      for (const name of names) {
        const submodule = this.pythonModule(root, dotted ? `${dotted}.${name}` : name);
        if (submodule) found.push(submodule);
      }
      if (found.length === 0 && !dotted) {
        const init = this.firstExisting([joinInside(root, '__init__.py')]);
        if (init) found.push(init);
      }
      if (found.length > 0) return [...new Set(found)];
    }
    return [];
  }

  pythonModule(root, dotted) {
    const base = joinInside(root, dotted.split('.').join('/'));
    if (base === null) return null;
    return this.firstExisting([`${base}.py`, joinInside(base, '__init__.py')]);
  }

  /** Project root, src/, the folder above the importer's top-level package, its own folder */
  pythonRoots(fromPath) {
    let dir = dirOf(fromPath);
    while (dir !== '' && this.has(joinInside(dir, '__init__.py'))) dir = dirOf(dir);
    return [...new Set(['', 'src', dir, dirOf(fromPath)])];
  }

  // -------------------------------------------------------------------------------- Go

  resolveGo(fromPath, spec) {
    if (this.goModules === null) this.goModules = this.findGoModules();
    let best = null;
    for (const module of this.goModules) {
      if (spec !== module.path && !spec.startsWith(`${module.path}/`)) continue;
      if (!best || module.path.length > best.path.length) best = module;
    }
    if (!best) return [];
    const dir = joinInside(best.dir, spec.slice(best.path.length).replace(/^\//, ''));
    if (dir === null) return [];
    return (this.dirFiles.get(dir) || []).filter(
      (file) => file.endsWith('.go') && !file.endsWith('_test.go') && file !== fromPath
    );
  }

  /** Every go.mod at or above a folder holding Go files */
  findGoModules() {
    const modules = new Map();
    for (const [dir, files] of this.dirFiles) {
      if (!files.some((file) => file.endsWith('.go'))) continue;
      let current = dir;
      for (;;) {
        const goMod = current === '' ? 'go.mod' : `${current}/go.mod`;
        if (!modules.has(current) && this.existsOnDisk(goMod)) {
          const match = (this.readText(goMod) || '').match(/^\s*module\s+(\S+)/m);
          modules.set(current, match ? { dir: current, path: match[1].replace(/"/g, '') } : null);
        }
        if (current === '') break;
        current = dirOf(current);
      }
    }
    return [...modules.values()].filter(Boolean);
  }

  // -------------------------------------------------------------- Java / Kotlin / Scala

  resolveJvm(ref) {
    if (ref.members.length > 0) {
      return ref.members.flatMap((member) => this.resolveTypeName(`${ref.name}.${member}`));
    }
    if (ref.wildcard) {
      if (this.packageIndex.has(ref.name)) return spread(this.packageIndex.get(ref.name));
      return single(this.typeIndex.get(ref.name) ?? null);
    }
    return this.resolveTypeName(ref.name);
  }

  /** `a.b.Outer.Inner` → the file of a.b.Outer; `a.b.topLevelFun` → files defining it */
  resolveTypeName(name) {
    const segments = name.split('.');
    for (let length = segments.length; length >= 2; length--) {
      const hit = this.typeIndex.get(segments.slice(0, length).join('.'));
      if (hit) return single(hit);
    }
    return this.membersOf(this.packageIndex.get(segments.slice(0, -1).join('.')), segments.at(-1));
  }

  /** Files of a package that define a function named `member` */
  membersOf(files, member) {
    if (!files) return [];
    return spread(
      files.filter((file) => this.nodes.get(file).methods?.some((m) => m.name === member))
    );
  }

  // ------------------------------------------------------------------------------ Ruby

  resolveRuby(fromPath, ref) {
    const spec = ref.spec.replace(/\.rb$/, '');
    const bases = ref.relative
      ? [joinInside(dirOf(fromPath), spec)]
      : [joinInside('lib', spec), joinInside(spec), joinInside(dirOf(fromPath), spec)];
    return this.firstExisting(bases.filter((base) => base !== null).map((base) => `${base}.rb`));
  }

  // ------------------------------------------------------------------------------- PHP

  resolvePhp(node, ref) {
    if (ref.include !== undefined) {
      const spec = ref.include;
      const candidates = ref.fromDir
        ? [joinInside(dirOf(node.path), spec.replace(/^\/+/, ''))]
        : spec.startsWith('/')
          ? []
          : [joinInside(dirOf(node.path), spec), joinInside(spec)];
      return single(this.firstExisting(candidates));
    }

    const name = ref.name.replace(/^\\/, '');
    const namespace = node.declarations?.[0];
    const names = [name];
    if (namespace && !name.includes('\\')) names.push(`${namespace}\\${name}`);
    for (const candidate of names) {
      const hit = this.phpIndex.get(candidate.toLowerCase());
      if (hit) return single(hit);
    }
    // `use function App\Support\helper;`: the namespace's files defining it
    const parts = name.split('\\');
    return this.membersOf(
      this.phpNamespaces.get(parts.slice(0, -1).join('\\').toLowerCase()),
      parts.at(-1)
    );
  }

  // ----------------------------------------------------------------------------- C/C++

  resolveInclude(fromPath, include) {
    const direct = this.firstExisting([
      joinInside(dirOf(fromPath), include),
      joinInside(include),
      joinInside('include', include),
      joinInside('src', include),
    ]);
    if (direct) return direct;

    // Include directories we do not know: any file whose path ends with the include,
    // the one closest to the includer
    const normalized = posix.normalize(include).replace(/^(\.\.\/)+/, '');
    const matches = (this.byBasename.get(posix.basename(normalized)) || []).filter(
      (file) => file === normalized || file.endsWith(`/${normalized}`)
    );
    let best = null;
    for (const file of matches) {
      if (!best || sharedDepth(file, fromPath) > sharedDepth(best, fromPath)) best = file;
    }
    return best;
  }

  // ------------------------------------------------------------------------------ Rust

  resolveRust(fromPath, ref) {
    const moduleDir = this.rustModuleDir(fromPath);
    if (ref.mod !== undefined) {
      return this.firstExisting([
        joinInside(moduleDir, `${ref.mod}.rs`),
        joinInside(moduleDir, ref.mod, 'mod.rs'),
      ]);
    }

    let startDir;
    const segments = [...ref.segments];
    if (ref.crate !== undefined) {
      startDir = this.crateSources().get(ref.crate);
      if (startDir === undefined) return null;
    } else if (ref.anchor === 'crate') {
      startDir = this.rustSourceDir(fromPath);
    } else {
      startDir = moduleDir;
      if (ref.anchor === 'super') startDir = dirOf(moduleDir);
      while (segments[0] === 'super') {
        segments.shift();
        startDir = dirOf(startDir);
      }
    }
    if (startDir === null) return null;

    let dir = startDir;
    let found = null;
    for (const segment of segments) {
      const hit = this.firstExisting([
        joinInside(dir, `${segment}.rs`),
        joinInside(dir, segment, 'mod.rs'),
      ]);
      if (!hit) break;
      found = hit;
      dir = joinInside(dir, segment);
    }
    return found ?? this.rustModuleFile(startDir);
  }

  /** Folder holding the submodules of a file: its own folder for crate roots and mod.rs */
  rustModuleDir(fromPath) {
    const base = posix.basename(fromPath);
    const dir = dirOf(fromPath);
    if (['lib.rs', 'main.rs', 'mod.rs', 'build.rs'].includes(base)) return dir;
    if (RUST_ROOT_DIRS.has(posix.basename(dir))) return dir;
    return fromPath.slice(0, -'.rs'.length);
  }

  /** File of the module whose submodules live in `dir` */
  rustModuleFile(dir) {
    return this.firstExisting([
      `${dir}.rs`,
      joinInside(dir, 'mod.rs'),
      joinInside(dir, 'lib.rs'),
      joinInside(dir, 'main.rs'),
    ]);
  }

  /** `src/` of the crate (nearest Cargo.toml) a file belongs to */
  rustSourceDir(fromPath) {
    const crateDir = this.cargoDir(dirOf(fromPath));
    return crateDir === null ? null : joinInside(crateDir, 'src');
  }

  cargoDir(dir) {
    if (this.cargoCache.has(dir)) return this.cargoCache.get(dir);
    let result = null;
    if (this.existsOnDisk(dir === '' ? 'Cargo.toml' : `${dir}/Cargo.toml`)) result = dir;
    else if (dir !== '') result = this.cargoDir(dirOf(dir));
    this.cargoCache.set(dir, result);
    return result;
  }

  /** Workspace crates by name (`my-crate` is used as `my_crate`) → their src/ folder */
  crateSources() {
    if (this.cratesByName) return this.cratesByName;
    this.cratesByName = new Map();
    const crateDirs = new Set();
    for (const file of this.nodes.keys()) {
      if (!file.endsWith('.rs')) continue;
      const crateDir = this.cargoDir(dirOf(file));
      if (crateDir !== null) crateDirs.add(crateDir);
    }
    for (const crateDir of crateDirs) {
      const manifest = this.readText(crateDir === '' ? 'Cargo.toml' : `${crateDir}/Cargo.toml`);
      const match = manifest?.match(/^\s*\[package\][^[]*?^\s*name\s*=\s*"([^"]+)"/m);
      if (match) this.cratesByName.set(match[1].replace(/-/g, '_'), joinInside(crateDir, 'src'));
    }
    return this.cratesByName;
  }

  // ---------------------------------------------------------------------------- C#

  resolveCSharp(ref) {
    if (!ref.isStatic && this.packageIndex.has(ref.name)) {
      return spread(this.packageIndex.get(ref.name));
    }
    return single(this.typeIndex.get(ref.name) ?? null);
  }
}

function addTo(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function single(target) {
  return target ? [{ to: target, weight: 1 }] : [];
}

/** A dependency on a package of n files: each file gets 1/n of the edge */
function spread(targets) {
  return targets.map((to) => ({ to, weight: 1 / targets.length }));
}

export default ImportResolver;
