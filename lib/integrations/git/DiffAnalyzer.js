/**
 * DiffAnalyzer - Git Diff Analysis Module
 * v3.0.0 - Complete Git integration
 *
 * Responsibilities:
 * - Analyze git diffs
 * - Detect change impact
 * - Find related files
 * - Generate change summaries
 */

import GitClient from './GitClient.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('DiffAnalyzer');

export class DiffAnalyzer {
  constructor(repositoryPath) {
    this.git = new GitClient(repositoryPath);
    this.repoPath = repositoryPath;
  }

  /**
   * Analyze changes since a reference point
   * @param {string} since - Commit/branch reference
   * @returns {ChangeAnalysis}
   */
  analyzeChanges(since = null) {
    logger.info(`Analyzing changes since: ${since || 'uncommitted'}`);

    const changedFiles = since ? this.git.getChangedFiles(since) : this.git.getAllModifiedFiles();

    const analysis = {
      changedFiles: changedFiles,
      totalChangedFiles: changedFiles.length,
      since: since,
      relatedFiles: [],
      impact: this.calculateImpact(changedFiles),
    };

    return analysis;
  }

  /**
   * Get changed files with detailed diff
   * @param {string} since
   * @returns {Array<FileChange>}
   */
  getDetailedChanges(since = null) {
    const changedFiles = since ? this.git.getChangedFiles(since) : this.git.getAllModifiedFiles();

    return changedFiles.map((filePath) => {
      const diff = this.getFileDiff(filePath, since);
      return {
        path: filePath,
        ...diff,
      };
    });
  }

  /**
   * Get diff for specific file
   * @param {string} filePath
   * @param {string} since
   * @returns {FileDiff}
   */
  getFileDiff(filePath, since = null) {
    try {
      const command = since ? `diff ${since} -- "${filePath}"` : `diff -- "${filePath}"`;

      const diffOutput = this.git.exec(command);
      const stats = this.parseDiffStats(diffOutput);

      return {
        added: stats.added,
        deleted: stats.deleted,
        modified: stats.added + stats.deleted,
        diff: diffOutput,
      };
    } catch (error) {
      logger.warn(`Failed to get diff for ${filePath}: ${error.message}`);
      return { added: 0, deleted: 0, modified: 0, diff: '' };
    }
  }

  /**
   * Parse diff statistics
   * @param {string} diffOutput
   * @returns {object}
   */
  parseDiffStats(diffOutput) {
    let added = 0;
    let deleted = 0;

    const lines = diffOutput.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        added++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deleted++;
      }
    }

    return { added, deleted };
  }

  /**
   * Calculate change impact score
   * @param {Array<string>} changedFiles
   * @returns {object}
   */
  calculateImpact(changedFiles) {
    const impact = {
      level: 'low',
      score: 0,
      details: {
        coreFiles: 0,
        configFiles: 0,
        testFiles: 0,
        documentationFiles: 0,
      },
    };

    for (const file of changedFiles) {
      const fileLower = file.toLowerCase();

      // Core files (high impact)
      if (
        fileLower.includes('src/') ||
        fileLower.includes('lib/') ||
        fileLower.includes('index.') ||
        fileLower.includes('main.') ||
        fileLower.includes('app.') ||
        fileLower.includes('server.')
      ) {
        impact.details.coreFiles++;
        impact.score += 10;
      }

      // Config files (medium-high impact)
      if (
        fileLower.endsWith('.json') ||
        fileLower.endsWith('.yml') ||
        fileLower.endsWith('.yaml') ||
        fileLower.endsWith('.config.js')
      ) {
        impact.details.configFiles++;
        impact.score += 7;
      }

      // Test files (medium impact)
      if (fileLower.includes('test') || fileLower.includes('spec')) {
        impact.details.testFiles++;
        impact.score += 3;
      }

      // Documentation (low impact)
      if (fileLower.endsWith('.md') || fileLower.includes('docs/')) {
        impact.details.documentationFiles++;
        impact.score += 1;
      }
    }

    // Determine impact level
    if (impact.score >= 50) {
      impact.level = 'critical';
    } else if (impact.score >= 25) {
      impact.level = 'high';
    } else if (impact.score >= 10) {
      impact.level = 'medium';
    } else {
      impact.level = 'low';
    }

    return impact;
  }

  /**
   * Find related files based on imports/dependencies
   * @param {Array<string>} changedFiles
   * @returns {Array<string>}
   */
  findRelatedFiles(changedFiles) {
    // TODO: Implement import graph analysis
    // For now, return empty array
    logger.debug('Related files detection not yet implemented');
    return [];
  }

  /**
   * Get file change frequency (how often file is modified)
   * @param {string} filePath
   * @returns {number}
   */
  getFileChangeFrequency(filePath) {
    return this.git.getCommitCount(filePath);
  }

  /**
   * Compare two branches
   * @param {string} base - Base branch
   * @param {string} compare - Compare branch
   * @returns {BranchComparison}
   */
  compareBranches(base, compare) {
    try {
      const command = `diff --name-status ${base}...${compare}`;
      const output = this.git.exec(command);

      const changes = {
        added: [],
        modified: [],
        deleted: [],
        renamed: [],
      };

      if (!output) return changes;

      const lines = output.split('\n');
      for (const line of lines) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t');

        if (status === 'A') changes.added.push(filePath);
        else if (status === 'M') changes.modified.push(filePath);
        else if (status === 'D') changes.deleted.push(filePath);
        else if (status.startsWith('R')) changes.renamed.push(filePath);
      }

      return changes;
    } catch (error) {
      logger.error(`Branch comparison failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get commit range statistics
   * @param {string} range - Commit range (e.g., 'v1.0.0..v2.0.0')
   * @returns {object}
   */
  getRangeStats(range) {
    try {
      const command = `diff --shortstat ${range}`;
      const output = this.git.exec(command);

      // Parse: "3 files changed, 45 insertions(+), 12 deletions(-)"
      const match = output.match(
        /(\d+) file[s]? changed(?:, (\d+) insertion[s]?\(\+\))?(?:, (\d+) deletion[s]?\(-\))?/
      );

      if (!match) return null;

      return {
        filesChanged: parseInt(match[1], 10),
        insertions: parseInt(match[2] || 0, 10),
        deletions: parseInt(match[3] || 0, 10),
      };
    } catch (error) {
      return null;
    }
  }
}

export default DiffAnalyzer;
