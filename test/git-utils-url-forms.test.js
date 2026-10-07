import { describe, it, expect } from 'vitest';
import GitUtils from '../lib/utils/git-utils.js';

describe('GitUtils.parseGitHubURL URL forms', () => {
  const gitUtils = new GitUtils();

  // Every form listed under "URL Formats" in `ctxman github --help`
  it.each([
    'https://github.com/facebook/react',
    'https://github.com/facebook/react.git',
    'git@github.com:facebook/react.git',
    'github.com/facebook/react',
    'facebook/react',
  ])('parses %s as facebook/react', (url) => {
    const info = gitUtils.parseGitHubURL(url);

    expect(info.owner).toBe('facebook');
    expect(info.repo).toBe('react');
    expect(info.cloneUrl).toBe('https://github.com/facebook/react.git');
  });

  it('still rejects a host-only form without a repository', () => {
    expect(() => gitUtils.parseGitHubURL('github.com/facebook')).toThrow(
      'must include owner and repo'
    );
  });
});
