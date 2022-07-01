module.exports = {
  extends: 'standard-with-typescript',
  parserOptions: {
    sourceType: 'module', // Allows for the use of imports
    project: './tsconfig.json'
  },
  ignorePatterns: ['**/*.d.ts', '**/*.js', '**/*.js.map'],
  rules: {
    'no-console': 'error',
    'no-async-promise-executor': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off'
  },
  overrides: [
    {
      // Disable some rules that we abuse in unit tests.
      files: ['test/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    }
  ]
}
