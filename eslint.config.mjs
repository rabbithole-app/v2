import nx from '@nx/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'apps/backend/src/declarations',
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
          customGroups: {
            type: {
              angular: '^@angular/.+',
              dfinity: '^@dfinity/.+',
              spartan: ['^@spartan-ng/.+', 'clsx', 'class-variance-authority'],
              tauri: '^@tauri-apps/.+',
            },
            value: {
              angular: '^@angular/.+',
              dfinity: '^@dfinity/.+',
              rxjs: ['^rxjs$', '^rxjs/.+', '^ngxtension/.+'],
              spartan: ['^@spartan-ng/.+', 'clsx', 'class-variance-authority'],
              tauri: '^@tauri-apps/.+',
            },
          },
          environment: 'node',
          groups: [
            [
              'angular',
              'dfinity',
              'spartan',
              'tauri',
              'rxjs',
              'type',
              ...['builtin', 'external'],
            ],
            [
              'internal-type',
              'internal',
              ...['parent-type', 'sibling-type', 'index-type'],
              ...['parent', 'sibling', 'index'],
              'object',
              'unknown',
            ],
          ],
          internalPattern: [
            '^~/.*',
            '^@spartan-ng/ui-.+',
            '^@rabbithole/.+',
            '^@core/.+',
            '^@declarations/.+',
            '^@environments/.+',
          ],
          maxLineLength: undefined,
          newlinesBetween: 'always',
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
