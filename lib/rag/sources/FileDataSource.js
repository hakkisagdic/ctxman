import fs from 'fs/promises';
import path from 'path';
import { DataSourcePlugin } from '../DataSourcePlugin.js';
import { TokenizerManager } from '../../utils/tokenizer-adapter.js';

export class FileDataSource extends DataSourcePlugin {
  constructor() {
    super('local-files');
    this.tokenizer = new TokenizerManager();
  }

  async validateConfig(config) {
    // Requires a target directory
    return !!config.targetDir;
  }

  async *collect(options = {}) {
    const targetDir = options.targetDir || process.cwd();
    const maxDepth = options.maxDepth || 5;
    const include = options.include || ['.js', '.md', '.ts', '.json'];
    const exclude = options.exclude || ['node_modules', '.git', 'dist', 'coverage'];

    yield* this.walkDirectory(targetDir, maxDepth, include, exclude);
  }

  async *walkDirectory(dir, depth, include, exclude) {
    if (depth < 0) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`[FileDataSource] Skipping ${dir}: ${error.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (exclude.some((ex) => fullPath.includes(ex))) continue;

      if (entry.isDirectory()) {
        yield* this.walkDirectory(fullPath, depth - 1, include, exclude);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (include.length > 0 && !include.includes(ext)) continue;

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          // Basic text check (skip binaries)
          if (content.includes('\0')) continue;

          yield {
            id: fullPath,
            text: content,
            metadata: {
              source: 'file-system',
              path: fullPath,
              extension: ext,
              filename: entry.name,
              size: content.length,
            },
          };
        } catch (error) {
          console.warn(`[FileDataSource] Failed to read ${fullPath}: ${error.message}`);
        }
      }
    }
  }
}
