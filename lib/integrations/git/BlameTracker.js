/**
 * BlameTracker - Author Attribution Module
 * v3.0.0 - Complete Git integration
 *
 * Responsibilities:
 * - Track file ownership
 * - Author contribution analysis
 * - Code ownership distribution
 * - Hot spot detection
 */

import GitClient from './GitClient.js';
import { getLogger } from '../../utils/logger.js';

const _logger = getLogger('BlameTracker');

export class BlameTracker {
  constructor(repositoryPath) {
    this.git = new GitClient(repositoryPath);
  }

  /**
   * Get primary author for file (most commits)
   * @param {string} filePath
   * @returns {Author|null}
   */
  getPrimaryAuthor(filePath) {
    const authors = this.git.getFileAuthors(filePath);
    return authors.length > 0 ? authors[0] : null;
  }

  /**
   * Get author contribution distribution
   * @param {Array<string>} filePaths
   * @returns {Map<string, AuthorStats>}
   */
  getAuthorContributions(filePaths) {
    const contributions = new Map();

    for (const filePath of filePaths) {
      const authors = this.git.getFileAuthors(filePath);

      for (const author of authors) {
        if (!contributions.has(author.email)) {
          contributions.set(author.email, {
            name: author.name,
            email: author.email,
            filesOwned: 0,
            totalCommits: 0,
          });
        }

        const stats = contributions.get(author.email);
        stats.filesOwned++;
        stats.totalCommits += author.commits;
      }
    }

    return contributions;
  }

  /**
   * Get code ownership map
   * @param {Array<string>} filePaths
   * @returns {Map<string, Author>}
   */
  getOwnershipMap(filePaths) {
    const ownership = new Map();

    for (const filePath of filePaths) {
      const owner = this.getPrimaryAuthor(filePath);
      if (owner) {
        ownership.set(filePath, owner);
      }
    }

    return ownership;
  }

  /**
   * Detect hot spots (frequently changed files)
   * @param {Array<string>} filePaths
   * @param {number} threshold - Minimum commits to be considered hot
   * @returns {Array<HotSpot>}
   */
  detectHotSpots(filePaths, threshold = 10) {
    const hotSpots = [];

    for (const filePath of filePaths) {
      const commitCount = this.git.getCommitCount(filePath);

      if (commitCount >= threshold) {
        const authors = this.git.getFileAuthors(filePath);

        hotSpots.push({
          path: filePath,
          commitCount,
          authorCount: authors.length,
          primaryAuthor: authors[0],
          risk: this.calculateRiskScore(commitCount, authors.length),
        });
      }
    }

    return hotSpots.sort((a, b) => b.risk - a.risk);
  }

  /**
   * Calculate risk score for a file
   * @param {number} commitCount
   * @param {number} authorCount
   * @returns {number}
   */
  calculateRiskScore(commitCount, authorCount) {
    // High commit count + multiple authors = higher risk
    const commitScore = Math.log(commitCount + 1) * 10;
    const authorScore = authorCount * 5;
    return commitScore + authorScore;
  }

  /**
   * Get file ownership summary
   * @param {Array<string>} filePaths
   * @returns {object}
   */
  getOwnershipSummary(filePaths) {
    const contributions = this.getAuthorContributions(filePaths);

    const topContributors = Array.from(contributions.values())
      .sort((a, b) => b.totalCommits - a.totalCommits)
      .slice(0, 10);

    return {
      totalAuthors: contributions.size,
      totalFiles: filePaths.length,
      topContributors,
      averageFilesPerAuthor: filePaths.length / contributions.size,
    };
  }
}

export default BlameTracker;
