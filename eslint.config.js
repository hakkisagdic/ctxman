/**
 * ESLint Flat Configuration
 * Migrated from .eslintrc.json for ESLint 9.x compatibility
 */
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'test-repos/**',
      'html/**', // Built desktop app assets
      'website/.vitepress/dist/**', // Built website assets
      'website/.vitepress/cache/**', // Website cache
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
    },
  },
  {
    // Shipped code is ESM: CommonJS globals do not exist there, and an undefined
    // name is a ReferenceError at runtime (often on an error path no test reaches)
    files: ['index.js', 'ctxman.js', 'bin/**/*.js', 'lib/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        require: 'off',
        module: 'off',
        exports: 'off',
        __dirname: 'off',
        __filename: 'off',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
