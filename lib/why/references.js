/**
 * References mined from commit messages: issue and pull request numbers, ticket keys,
 * CVE ids, URLs and Co-authored-by / Reviewed-by trailers, with web links when `origin`
 * is a GitHub, GitLab or Bitbucket remote
 */

// Upper-case words followed by a number that are not ticket keys
const NOT_TICKETS = new Set([
  'AES',
  'ANSI',
  'ASCII',
  'BASE',
  'BSD',
  'CC',
  'CP',
  'CRC',
  'CVE',
  'CWE',
  'DES',
  'ECMA',
  'ES',
  'GH',
  'GPL',
  'HTTP',
  'HTTPS',
  'IEC',
  'IEEE',
  'IPV',
  'ISO',
  'LGPL',
  'AGPL',
  'MD',
  'MPL',
  'PEP',
  'POSIX',
  'RFC',
  'RSA',
  'SHA',
  'SSL',
  'TLS',
  'UCS',
  'UTF',
  'WCAG',
  'WIN',
  'X',
]);

const KIND_RANK = { pr: 2, mr: 2, issue: 1 };

/**
 * Parse a remote URL (https, ssh, scp-like `git@host:owner/repo.git`) into a provider and
 * a web base URL. Credentials and ports of ssh remotes are dropped
 * @param {string|null} url
 * @returns {{provider: 'github'|'gitlab'|'bitbucket'|null, host: string, repoPath: string,
 *   webUrl: string}|null} null for local paths and unparsable URLs
 */
export function parseRemote(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  let host;
  let port = '';
  let repoPath;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch (_error) {
      return null;
    }
    if (parsed.protocol === 'file:') return null;
    host = parsed.hostname;
    if (/^https?:$/.test(parsed.protocol) && parsed.port) port = `:${parsed.port}`;
    repoPath = decodeURIComponent(parsed.pathname);
  } else {
    // scp-like syntax; a single letter before ':' is a Windows drive
    const scp = trimmed.match(/^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/);
    if (!scp) return null;
    host = scp[1];
    repoPath = scp[2];
  }

  repoPath = repoPath.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!host || !repoPath.includes('/')) return null;

  const provider = /github/i.test(host)
    ? 'github'
    : /gitlab/i.test(host)
      ? 'gitlab'
      : /bitbucket/i.test(host)
        ? 'bitbucket'
        : null;
  if (provider === 'github' || provider === 'bitbucket') {
    repoPath = repoPath.split('/').slice(0, 2).join('/');
  }
  // ssh.github.com / altssh.gitlab.com serve ssh only
  const webHost = host.replace(/^(alt)?ssh\./i, '').toLowerCase();
  return { provider, host: webHost, repoPath, webUrl: `https://${webHost}${port}/${repoPath}` };
}

/**
 * Web link for an issue / pull request / merge request
 * @param {ReturnType<typeof parseRemote>} remote
 * @param {string|null} repoPath - Another repository on the same host (owner/repo#12)
 * @param {number} number
 * @param {string} kind
 * @returns {string|null}
 */
export function issueLink(remote, repoPath, number, kind) {
  if (!remote?.provider) return null;
  const base = repoPath
    ? remote.webUrl.slice(0, remote.webUrl.length - remote.repoPath.length) + repoPath
    : remote.webUrl;
  const isChange = kind === 'pr' || kind === 'mr';
  switch (remote.provider) {
    case 'github':
      // GitHub redirects /issues/N to /pull/N for pull requests
      return `${base}/${isChange ? 'pull' : 'issues'}/${number}`;
    case 'gitlab':
      return `${base}/-/${isChange ? 'merge_requests' : 'issues'}/${number}`;
    case 'bitbucket':
      return `${base}/${isChange ? 'pull-requests' : 'issues'}/${number}`;
    default:
      return null;
  }
}

/**
 * Remove user:password@ from a URL
 * @param {string} url
 * @returns {string}
 */
function stripCredentials(url) {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1');
}

/**
 * Collect references from commits (newest first). Each entry lists the short hashes of
 * the commits that mention it, in history order
 * @param {Array<{shortSha: string, subject: string, body: string}>} commits
 * @param {ReturnType<typeof parseRemote>} remote
 * @returns {{issues: object[], tickets: object[], cves: object[], urls: object[],
 *   coAuthors: object[], reviewers: object[]}}
 */
export function mineReferences(commits, remote) {
  const issues = new Map();
  const tickets = new Map();
  const cves = new Map();
  const urls = new Map();
  const coAuthors = new Map();
  const reviewers = new Map();

  const note = (map, key, entry, sha) => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...entry, commits: [sha] });
      return;
    }
    if (!existing.commits.includes(sha)) existing.commits.push(sha);
    if (entry.closes) existing.closes = true;
    if (entry.kind && (KIND_RANK[entry.kind] ?? 0) > (KIND_RANK[existing.kind] ?? 0)) {
      existing.kind = entry.kind;
      existing.url = entry.url;
    }
  };

  // kind: issue, pr (pull request) or mr (GitLab merge request); closes: a closing
  // keyword (fixes / closes / resolves) referred to it
  const addIssue = (repoPath, number, kind, sha, closes = false) => {
    if (!/^[1-9]\d{0,8}$/.test(number)) return;
    const id = `${repoPath ?? ''}#${number}`;
    note(
      issues,
      id,
      {
        id,
        number: Number(number),
        repo: repoPath ?? null,
        kind,
        closes,
        url: issueLink(remote, repoPath, number, kind),
      },
      sha
    );
  };

  for (const commit of commits) {
    const sha = commit.shortSha;
    const message = `${commit.subject}\n\n${commit.body}`;

    // URLs first, then blank them out so their fragments and paths are not read as refs
    let text = message.replace(/\bhttps?:\/\/[^\s<>"'`]+/gi, (raw) => {
      const url = stripCredentials(raw.replace(/[).,;:!?\]}>]+$/, ''));
      note(urls, url, { url }, sha);
      return ' '.repeat(raw.length);
    });

    for (const match of text.matchAll(/^\s*(Co-authored-by|Reviewed-by)\s*:\s*(.+?)\s*$/gim)) {
      const value = match[2];
      const map = match[1].toLowerCase() === 'co-authored-by' ? coAuthors : reviewers;
      note(map, value.toLowerCase(), { value }, sha);
    }
    // Trailers carry e-mail addresses, not references
    text = text.replace(/^\s*[\w-]+-by\s*:.*$/gim, '');

    // Pull / merge requests: squash suffix "(#45)", merge commits, GitLab "!45"
    const squash = commit.subject.match(/\(#(\d+)\)\s*$/);
    if (squash) addIssue(null, squash[1], remote?.provider === 'gitlab' ? 'issue' : 'pr', sha);
    for (const match of text.matchAll(/\b(?:Merge pull request|pull request) #(\d+)/gi)) {
      addIssue(null, match[1], 'pr', sha);
    }
    if (remote?.provider === 'gitlab') {
      for (const match of text.matchAll(/(?:^|[\s(])(?:([\w.-]+(?:\/[\w.-]+)+))?!(\d+)\b/g)) {
        addIssue(match[1] ?? null, match[2], 'mr', sha);
      }
    }

    for (const match of text.matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi
    )) {
      addIssue(match[1] ?? null, match[2], 'issue', sha, true);
    }
    for (const match of text.matchAll(/(?:^|[^\w&/#])(?:([\w.-]+\/[\w.-]+))?#(\d+)(?!\w)/g)) {
      addIssue(match[1] ?? null, match[2], 'issue', sha);
    }
    for (const match of text.matchAll(/\bGH-(\d+)\b/g)) {
      addIssue(null, match[1], 'issue', sha);
    }

    for (const match of text.matchAll(/\bCVE-\d{4}-\d{4,}\b/g)) {
      note(cves, match[0], { id: match[0] }, sha);
    }
    for (const match of text.matchAll(/(?<![\w-])([A-Z][A-Z0-9]{1,9})-(\d{1,7})(?![\w])/g)) {
      if (NOT_TICKETS.has(match[1]) || /^0/.test(match[2])) continue;
      note(tickets, match[0], { id: match[0] }, sha);
    }
  }

  return {
    issues: [...issues.values()],
    tickets: [...tickets.values()],
    cves: [...cves.values()],
    urls: [...urls.values()],
    coAuthors: [...coAuthors.values()],
    reviewers: [...reviewers.values()],
  };
}

/**
 * Ids of the references a single commit mentions (for the history section)
 * @param {ReturnType<typeof mineReferences>} references
 * @param {string} shortSha
 * @returns {string[]}
 */
export function referencesOf(references, shortSha) {
  return [...references.issues, ...references.tickets, ...references.cves]
    .filter((entry) => entry.commits.includes(shortSha))
    .map((entry) => entry.id);
}
