// @ts-check

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

// The era seams' import restrictions, hoisted so each override block can re-state the seams it is
// *not* the binding for. In flat config a later `rules` entry for the same rule replaces the
// earlier options wholesale rather than merging them, so an override that lists only the `dist`
// pattern silently drops both seam restrictions for every file it matches.
const DIST_IMPORT_PATTERN = {
  group: ['**/dist/**', './dist/**', '../dist/**'],
  message: 'Direct imports from dist folders are not allowed. Use source files instead.'
};

const LEDGER_SEAM_PATTERN = {
  // Both scope spellings, and their subpaths: `*` does not cross `/`, and the
  // hyphenated `@midnight-ntwrk/ledger-v8` is resolvable in this workspace via
  // `@midnight-ntwrk/wallet-sdk-address-format`.
  group: [
    '@midnightntwrk/ledger-v*',
    '@midnightntwrk/ledger-v*/**',
    '@midnight-ntwrk/ledger-v*',
    '@midnight-ntwrk/ledger-v*/**'
  ],
  message:
    'Import ledger types through the `Ledger` facade (@midnight-ntwrk/compact-js/effect); ' +
    'only compact-js/src/effect/internal/ledger/* may bind an era package directly.'
};

const RUNTIME_SEAM_PATTERN = {
  // The compact-runtime line is era-paired with the ledger (0.19 with ledger 9, over
  // onchain-runtime-v4), so it needs the same seam: a second era entry has to resolve a different
  // runtime line, which it cannot do while call sites name the package. Only the hyphenated scope
  // is listed because, unlike the ledger packages above, no `@midnightntwrk/compact-runtime` is
  // published — add the second spelling here if one ever is.
  group: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/compact-runtime/**'],
  message:
    'Import runtime types through the `CompactRuntime` facade (@midnight-ntwrk/compact-js/effect); ' +
    'only compact-js/src/effect/internal/runtime/* may bind a runtime line directly.'
};

// `no-restricted-imports` only inspects `ImportDeclaration` and `Export*Declaration`, so a dynamic
// `await import('@midnight-ntwrk/compact-runtime')` walks straight through both seams above. These
// close that hole. Kept as separate selectors (rather than folded into the patterns) because it is
// a different rule, and a different rule means each override block must re-state it too — same
// wholesale-replace hazard as the imports.
const LEDGER_SEAM_DYNAMIC_IMPORT = {
  selector: 'ImportExpression[source.value=/^@midnight-?ntwrk\\u002Fledger-v/]',
  message: LEDGER_SEAM_PATTERN.message
};

const RUNTIME_SEAM_DYNAMIC_IMPORT = {
  selector: 'ImportExpression[source.value=/^@midnight-ntwrk\\u002Fcompact-runtime/]',
  message: RUNTIME_SEAM_PATTERN.message
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.rollup.cache/**',
      '**/gen/**',
      '**/generated/**',
      // `managed/` is compactc's output for the bound era's fixtures; `managed-v<N>/` is the same
      // output for an era-pinned fixture set (`managed-v8/`). Both are generated and checked in,
      // so neither is ours to lint — the second pattern is not covered by the first.
      '**/managed/**',
      '**/managed-v*/**',
      '**/*.d.ts',
      '**/node_modules/**',
      '**/.yarn/**',
      '**/coverage/**',
      '**/tmp/**',
      '**/temp/**',
      '**/reports/**',
      '**/*.json'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'import-x': importPlugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports
    },
    settings: {
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts']
      },
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: false,
          project: ['tsconfig.json', '*/tsconfig.json']
        }
      }
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          'vars': 'all',
          'varsIgnorePattern': '^_',
          'args': 'after-used',
          'argsIgnorePattern': '^_'
        }
      ],
      'object-curly-newline': ['error', {
        'ImportDeclaration': 'never'
      }],
      'object-property-newline': ['error', {
        'allowAllPropertiesOnSameLine': true
      }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-object-literal-type-assertion': 'off',
      '@typescript-eslint/prefer-interface': 'off',
      '@typescript-eslint/camelcase': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-use-before-define': ['error'],
      '@typescript-eslint/no-shadow': ['error'],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          'fixStyle': 'inline-type-imports'
        }
      ],
      '@typescript-eslint/no-namespace': [
        'error',
        // Ensure that we allow namespace declarations to support Effect style typing.
        {
          'allowDeclarations': true
        }
      ],
      'no-shadow': 'off',
      'prefer-destructuring': 'off',
      'no-use-before-define': 'off',
      'import-x/prefer-default-export': 'off',
      'import-x/no-default-export': 'off',
      'import-x/extensions': 'off',
      'import-x/no-unresolved': 'error',
      'import-x/no-extraneous-dependencies': 'off',
      'max-classes-per-file': 'off',
      'lines-between-class-members': 'off',
      'no-restricted-imports': [
        'error',
        { patterns: [DIST_IMPORT_PATTERN, LEDGER_SEAM_PATTERN, RUNTIME_SEAM_PATTERN] }
      ],
      'no-restricted-syntax': ['error', LEDGER_SEAM_DYNAMIC_IMPORT, RUNTIME_SEAM_DYNAMIC_IMPORT],
    }
  },
  {
    // A ledger binding is the one place allowed to import its own era package — but it is not a
    // runtime binding, so the compact-runtime restriction still applies. Exempting both seams here
    // would give the runtime seam a second binding point, and an era swap that repointed only
    // `internal/runtime/current.ts` would leave this file speaking the old line. `CompactRuntime.test.ts`
    // could not catch that: it compares one `current.ts` against the other.
    files: ['compact-js/src/effect/internal/ledger/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DIST_IMPORT_PATTERN, RUNTIME_SEAM_PATTERN] }],
      'no-restricted-syntax': ['error', RUNTIME_SEAM_DYNAMIC_IMPORT],
    }
  },
  {
    // The mirror of the block above: a runtime binding may name its own compact-runtime line and
    // nothing else across either seam.
    files: ['compact-js/src/effect/internal/runtime/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DIST_IMPORT_PATTERN, LEDGER_SEAM_PATTERN] }],
      'no-restricted-syntax': ['error', LEDGER_SEAM_DYNAMIC_IMPORT],
    }
  },
  {
    // Tests may reach past both seams — some must compare module identity, and others mock the
    // underlying package to force a boundary rejection.
    files: ['**/test/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DIST_IMPORT_PATTERN] }],
      'no-restricted-syntax': 'off',
    }
  },
  {
    // Node.js build/release utility scripts (run directly with `node`).
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly'
      }
    }
  },
  prettierConfig
);
