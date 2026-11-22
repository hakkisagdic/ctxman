/**
 * Shared git environment for tests that create temporary repositories.
 *
 * During `git push` git exports GIT_DIR (and friends) to hooks. A test that runs
 * git in a temporary directory with those variables inherited would write into the
 * repository being pushed. Every test that spawns git passes cleanGitEnv() as env.
 */

export const GIT_REPO_ENV_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
];

/** Copy of process.env (plus extra) with repository-selecting git variables removed. */
export function cleanGitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of GIT_REPO_ENV_VARS) delete env[name];
  return env;
}

/** Remove the variables from this process so every child inherits a clean environment. */
export function scrubProcessGitEnv() {
  for (const name of GIT_REPO_ENV_VARS) delete process.env[name];
}
