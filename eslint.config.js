import config, { browser, mocha } from 'eslint-config-coinspace';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...config,
  ...browser,
  {
    languageOptions: {
      ecmaVersion: 2025,
    },
  },
  {
    files: ['test/**/*.js'],
    ...mocha[0],
  },
];
