/**
 * Commitlint Configuration
 * Enforces conventional commit format across the project
 * @see https://conventionalcommits.org/
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type enum - allowed commit types
    'type-enum': [
      2,
      'always',
      [
        'feat',     // A new feature
        'fix',      // A bug fix
        'docs',     // Documentation only changes
        'style',    // Changes that do not affect the meaning of the code
        'refactor', // A code change that neither fixes a bug nor adds a feature
        'perf',     // A code change that improves performance
        'test',     // Adding missing tests or correcting existing tests
        'build',    // Changes that affect the build system or external dependencies
        'ci',       // Changes to CI configuration files and scripts
        'chore',    // Other changes that don't modify src or test files
        'revert',   // Reverts a previous commit
      ],
    ],
    // Subject must not end with a period
    'subject-full-stop': [2, 'never', '.'],
    // Subject case - always lowercase
    'subject-case': [2, 'always', 'lower-case'],
    // Subject must be at least 3 characters
    'subject-min-length': [2, 'always', 3],
    // Subject must be at most 72 characters
    'subject-max-length': [2, 'always', 72],
    // Body max line length
    'body-max-line-length': [2, 'always', 100],
    // Footer max line length
    'footer-max-line-length': [2, 'always', 100],
    // Header max length
    'header-max-length': [2, 'always', 100],
  },
};
