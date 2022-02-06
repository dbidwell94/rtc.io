// eslint-disable-next-line
module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['**/dist/*.js', 'dist/'],
  rules: {
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};
