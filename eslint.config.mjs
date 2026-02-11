import nx from '@nx/eslint-plugin';
import eslintPluginJsonc from 'eslint-plugin-jsonc';
import perfectionist from 'eslint-plugin-perfectionist';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...eslintPluginJsonc.configs['flat/recommended-with-jsonc'],
  {
    ignores: [
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/{.dfx,.mops,declarations,dist}',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    plugins: { perfectionist },
    rules: {
      ...perfectionist.configs['recommended-alphabetical'].rules,
      'perfectionist/sort-enums': 'off',
      'perfectionist/sort-imports': [
        'warn',
        {
          customGroups: [
            {
              groupName: 'angular',
              elementNamePattern: '^@angular/.+',
            },
            {
              groupName: 'dfinity',
              elementNamePattern: ['^@dfinity/.+', '^@icp-sdk/.+'],
            },
            {
              groupName: 'spartan',
              elementNamePattern: [
                '^@spartan-ng/brain/.+',
                '^@ng-icons/.+',
                '^clsx$',
                '^class-variance-authority$',
              ],
            },
            {
              groupName: 'tauri',
              elementNamePattern: '^@tauri-apps/.+',
            },
            {
              groupName: 'rxjs',
              elementNamePattern: ['^rxjs$', '^rxjs/.+', '^ngxtension/.+'],
            },
            {
              groupName: 'libs',
              elementNamePattern: ['^@spartan-ng/helm/.+', '^@rabbithole/.+'],
            },
          ],
          groups: [
            [
              'angular',
              'dfinity',
              'spartan',
              'tauri',
              'rxjs',
              'type-import',
              'value-builtin',
              'value-external',
            ],
            'libs',
            [
              'type-internal',
              'value-internal',
              'type-parent',
              'type-sibling',
              'type-index',
              'value-parent',
              'value-sibling',
              'value-index',
              'ts-equals-import',
              'unknown',
            ],
          ],
          internalPattern: ['^~/.*'],
          newlinesBetween: 1,
          environment: 'node',
          order: 'asc',
          type: 'alphabetical',
        },
      ],
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-union-types': [
        'error',
        {
          groups: ['named', ['intersection', 'union'], 'unknown', 'nullish'],
          ignoreCase: true,
          order: 'asc',
          partitionByComment: false,
          partitionByNewLine: false,
          type: 'alphabetical',
        },
      ],
    },
  },
];
