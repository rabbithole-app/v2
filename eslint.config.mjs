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
          customGroups: {
            type: {
              angular: '^@angular/.+',
              dfinity: ['^@dfinity/.+', '^@icp-sdk/.+'],
              spartan: [
                '^@spartan-ng/brain/.+',
                '^@ng-icons/.+',
                'clsx',
                'class-variance-authority',
              ],
              tauri: '^@tauri-apps/.+',
              libs: ['^@spartan-ng/helm/.+', '^@rabbithole/.+'],
            },
            value: {
              angular: '^@angular/.+',
              dfinity: ['^@dfinity/.+', '^@icp-sdk/.+'],
              rxjs: ['^rxjs$', '^rxjs/.+', '^ngxtension/.+'],
              spartan: [
                '^@spartan-ng/brain/.+',
                '^@ng-icons/.+',
                'clsx',
                'class-variance-authority',
              ],
              tauri: '^@tauri-apps/.+',
              libs: ['^@spartan-ng/helm/.+', '^@rabbithole/.+'],
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
            'libs',
            [
              'internal-type',
              'internal',
              ...['parent-type', 'sibling-type', 'index-type'],
              ...['parent', 'sibling', 'index'],
              'object',
              'unknown',
            ],
          ],
          internalPattern: ['^~/.*'],
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
