// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint 9 flat config.
 *
 * Type-aware linting is deliberately off: it needs a full program per run and
 * would make `pnpm lint` several times slower than `pnpm typecheck`, which
 * already catches type errors. This config targets the things the compiler
 * does not — unused code, unsafe patterns, accidental `any`.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: { ecmaVersion: 2022 },
    },
    rules: {
      /* Nest's DI relies on decorator metadata and constructor injection, so
       * interfaces are routinely typed loosely at boundaries. These stay as
       * warnings to keep the signal without blocking a build. */
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      /* `@Injectable()` classes with only injected members are idiomatic. */
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    /* Seeds and tests legitimately log and reach for loose types. */
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
